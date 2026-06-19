"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Send, Calendar, Users, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  applyVariables,
  countVariables,
  type TemplateComponent,
} from "@/lib/templates/types";
import {
  createBroadcast,
  previewAudience,
  type AudienceFilter,
  type VariableMapping,
} from "@/lib/broadcasts/actions";

type Tpl = {
  id: string;
  name: string;
  language: string;
  channel_id: string | null;
  components: TemplateComponent[];
  example_values: Record<string, string[]> | null;
  category: string;
};

type MappingEntry =
  | { source: "contact_name"; fallback?: string }
  | { source: "fixed"; value: string };

type AudienceStats = {
  total: number;
  eligible: number;
  skipped_no_phone: number;
  skipped_opt_out: number;
};

export function BroadcastWizard({
  channels,
  templates,
  tags,
}: {
  channels: Array<{ id: string; name: string }>;
  templates: Tpl[];
  tags: string[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const channelTemplates = useMemo(
    () => templates.filter((t) => t.channel_id === channelId),
    [templates, channelId],
  );
  const [templateId, setTemplateId] = useState(channelTemplates[0]?.id ?? "");
  const template = channelTemplates.find((t) => t.id === templateId);

  // Reset template when channel changes.
  useEffect(() => {
    const first = channelTemplates[0]?.id ?? "";
    setTemplateId(first);
  }, [channelTemplates]);

  // Per-variable mapping. Header + body computed from template structure.
  const bodyText =
    (template?.components.find((c) => c.type === "BODY") as
      | { text: string }
      | undefined)?.text ?? "";
  const headerComp = template?.components.find((c) => c.type === "HEADER");
  const headerText =
    headerComp && "format" in headerComp && headerComp.format === "TEXT"
      ? (headerComp as { text: string }).text
      : "";
  const bodyVarCount = countVariables(bodyText);
  const headerVarCount = countVariables(headerText);

  // Media-header templates (IMAGE/VIDEO/DOCUMENT) need a media URL supplied at
  // send time — WhatsApp requires the header parameter or rejects the send.
  const headerMediaFormat =
    headerComp && "format" in headerComp &&
    (headerComp.format === "IMAGE" || headerComp.format === "VIDEO" || headerComp.format === "DOCUMENT")
      ? (headerComp.format as "IMAGE" | "VIDEO" | "DOCUMENT")
      : null;
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");

  const [bodyMapping, setBodyMapping] = useState<MappingEntry[]>([]);
  const [headerMapping, setHeaderMapping] = useState<MappingEntry[]>([]);

  useEffect(() => {
    // Pad mappings to match the template — defaulting any new slot to
    // "contact_name" for the first body variable (the common case) and
    // "fixed" for the rest.
    setBodyMapping((cur) => {
      const out: MappingEntry[] = [];
      for (let i = 0; i < bodyVarCount; i++) {
        out.push(
          cur[i] ?? (i === 0 ? { source: "contact_name" } : { source: "fixed", value: "" }),
        );
      }
      return out;
    });
    setHeaderMapping((cur) => {
      const out: MappingEntry[] = [];
      for (let i = 0; i < headerVarCount; i++) {
        out.push(cur[i] ?? { source: "fixed", value: "" });
      }
      return out;
    });
  }, [bodyVarCount, headerVarCount]);

  // Step 2
  const [audienceMode, setAudienceMode] = useState<"all" | "tags">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [lastActiveAfter, setLastActiveAfter] = useState("");
  const [stats, setStats] = useState<AudienceStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const audienceFilter: AudienceFilter = useMemo(() => {
    const f: AudienceFilter = {};
    if (audienceMode === "all") f.all = true;
    else if (selectedTags.length > 0) f.tags = selectedTags;
    if (lastActiveAfter) f.lastActiveAfter = new Date(lastActiveAfter).toISOString();
    return f;
  }, [audienceMode, selectedTags, lastActiveAfter]);

  useEffect(() => {
    if (step !== 2 || !channelId) return;
    let cancelled = false;
    setStatsLoading(true);
    (async () => {
      const res = await previewAudience(channelId, audienceFilter);
      if (cancelled) return;
      setStatsLoading(false);
      if (res.ok) setStats(res.data!);
      else toast.error(res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, channelId, audienceFilter]);

  // Step 3
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  // Sample-rendered preview using whatever example values the template
  // shipped with, so the user sees a realistic body before sending.
  const previewBody = useMemo(() => {
    const samples = template?.example_values?.body ?? [];
    return applyVariables(bodyText, samples);
  }, [bodyText, template]);

  function next() {
    if (step === 1) {
      if (!name.trim()) return toast.error("Add a name.");
      if (!templateId) return toast.error("Pick a template.");
      if (
        bodyMapping.some((m) => m.source === "fixed" && !m.value.trim()) ||
        headerMapping.some((m) => m.source === "fixed" && !m.value.trim())
      ) {
        return toast.error("Fill in all fixed variable values.");
      }
      if (headerMediaFormat && !headerMediaUrl.trim()) {
        return toast.error(`Add the ${headerMediaFormat.toLowerCase()} URL for the template header.`);
      }
    }
    if (step === 2) {
      if (audienceMode === "tags" && selectedTags.length === 0) {
        return toast.error("Pick at least one tag.");
      }
    }
    setStep((s) => (s === 1 ? 2 : 3));
  }

  function submit() {
    if (scheduleMode === "later" && !scheduledAt) {
      return toast.error("Pick a date and time.");
    }
    const mapping: VariableMapping = {};
    if (bodyMapping.length > 0) mapping.body = bodyMapping;
    if (headerMapping.length > 0) mapping.header = headerMapping;
    if (headerMediaFormat && headerMediaUrl.trim()) {
      mapping.header_media = {
        kind: headerMediaFormat.toLowerCase() as "image" | "video" | "document",
        link: headerMediaUrl.trim(),
      };
    }

    startTransition(async () => {
      const res = await createBroadcast({
        name,
        channelId,
        templateId,
        variableMapping: mapping,
        audienceFilter,
        scheduleMode,
        scheduledAt: scheduleMode === "later" ? scheduledAt : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        scheduleMode === "now"
          ? "Draft saved — click Launch now on the broadcast to send."
          : "Broadcast scheduled.",
      );
      router.push("/broadcasts");
    });
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <ol className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-2 text-xs">
        {(["Setup", "Audience", "Schedule"] as const).map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <li
              key={label}
              className={`flex flex-1 items-center gap-2 px-3 py-1 ${
                active ? "text-white" : done ? "text-white/60" : "text-white/40"
              }`}
            >
              <span
                className={`inline-flex size-5 items-center justify-center rounded-full text-[10px] ${
                  active
                    ? "xyra-gradient text-white"
                    : done
                      ? "bg-emerald-400/30 text-emerald-200"
                      : "bg-white/10 text-white/60"
                }`}
              >
                {n}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-xs">Campaign name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spring sale — March 2026"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">WhatsApp channel</Label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id} className="bg-zinc-900">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Template</Label>
              {channelTemplates.length === 0 ? (
                <p className="mt-1 rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/80">
                  No approved templates on this channel yet.
                </p>
              ) : (
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white"
                >
                  {channelTemplates.map((t) => (
                    <option key={t.id} value={t.id} className="bg-zinc-900">
                      {t.name} · {t.language} · {t.category}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {template && (
              <div className="space-y-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-wide text-white/50">
                  Sample render
                </p>
                <p className="whitespace-pre-wrap text-xs text-white/80">
                  {previewBody || "(empty body)"}
                </p>
              </div>
            )}

            {headerMediaFormat && (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="header-media-url">
                  {headerMediaFormat === "IMAGE" ? "Header image URL" : headerMediaFormat === "VIDEO" ? "Header video URL" : "Header document URL"}
                </Label>
                <Input
                  id="header-media-url"
                  type="url"
                  placeholder="https://…"
                  value={headerMediaUrl}
                  onChange={(e) => setHeaderMediaUrl(e.target.value)}
                />
                <p className="text-[11px] text-white/50">
                  This template has a {headerMediaFormat.toLowerCase()} header. Paste a public
                  HTTPS URL to the {headerMediaFormat.toLowerCase()} to attach when sending. WhatsApp
                  requires it.
                </p>
              </div>
            )}

            {(headerVarCount > 0 || bodyVarCount > 0) && (
              <div className="space-y-3">
                <Label className="text-xs">Variable mapping</Label>
                {headerMapping.map((m, i) => (
                  <MappingRow
                    key={`h-${i}`}
                    label={`Header {{${i + 1}}}`}
                    entry={m}
                    onChange={(next) => {
                      const arr = [...headerMapping];
                      arr[i] = next;
                      setHeaderMapping(arr);
                    }}
                  />
                ))}
                {bodyMapping.map((m, i) => (
                  <MappingRow
                    key={`b-${i}`}
                    label={`Body {{${i + 1}}}`}
                    entry={m}
                    onChange={(next) => {
                      const arr = [...bodyMapping];
                      arr[i] = next;
                      setBodyMapping(arr);
                    }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Audience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(["all", "tags"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAudienceMode(m)}
                  className={`flex-1 rounded-lg border p-3 text-left text-xs ${
                    audienceMode === m
                      ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="font-medium text-white">
                    {m === "all" ? "All contacts" : "By tag"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/60">
                    {m === "all"
                      ? "Every contact in this workspace (with a phone)"
                      : "Filter to contacts with specific tags"}
                  </div>
                </button>
              ))}
            </div>

            {audienceMode === "tags" && (
              <div>
                <Label className="text-xs">Tags</Label>
                {tags.length === 0 ? (
                  <p className="mt-1 text-xs text-white/50">
                    No tags in your workspace yet. Tag contacts in the inbox
                    first.
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {tags.map((t) => {
                      const on = selectedTags.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setSelectedTags((cur) =>
                              on ? cur.filter((x) => x !== t) : [...cur, t],
                            )
                          }
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                            on
                              ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/15 text-white"
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="last-active" className="text-xs">
                Active since (optional)
              </Label>
              <Input
                id="last-active"
                type="date"
                value={lastActiveAfter}
                onChange={(e) => setLastActiveAfter(e.target.value)}
                className="mt-1 max-w-[200px]"
              />
              <p className="mt-1 text-[10px] text-white/50">
                Only include contacts with conversation activity after this
                date.
              </p>
            </div>

            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2 text-sm">
                <Users className="size-4 text-white/60" />
                {statsLoading ? (
                  <span className="text-white/60">Counting…</span>
                ) : stats ? (
                  <>
                    <span className="font-semibold text-white">
                      {stats.eligible.toLocaleString()}
                    </span>
                    <span className="text-white/60">
                      will receive · {stats.total.toLocaleString()} matched
                    </span>
                  </>
                ) : (
                  <span className="text-white/60">No estimate yet.</span>
                )}
              </div>
              {stats && (stats.skipped_no_phone > 0 || stats.skipped_opt_out > 0) && (
                <p className="mt-1 text-[11px] text-white/50">
                  Skipped: {stats.skipped_opt_out.toLocaleString()} opted out
                  {stats.skipped_no_phone > 0
                    ? ` · ${stats.skipped_no_phone.toLocaleString()} no phone`
                    : ""}
                </p>
              )}
              {stats && stats.eligible > 1000 && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200/80">
                  <AlertCircle className="mt-px size-3 shrink-0" />
                  Large audience — broadcast will run in one ~{Math.ceil(stats.eligible / 67)}s
                  Vercel invocation. Anything &gt; 15,000 should be split across
                  multiple broadcasts for now.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(["now", "later"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setScheduleMode(m)}
                  className={`flex-1 rounded-lg border p-3 text-left text-xs ${
                    scheduleMode === m
                      ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="font-medium text-white">
                    {m === "now" ? "Send now" : "Schedule for later"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/60">
                    {m === "now"
                      ? "Saved as draft — launch with one click"
                      : "Sent automatically at the time you pick"}
                  </div>
                </button>
              ))}
            </div>

            {scheduleMode === "later" && (
              <div>
                <Label htmlFor="when" className="text-xs">
                  When
                </Label>
                <Input
                  id="when"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="mt-1 max-w-[260px]"
                />
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/50">
                  <Calendar className="size-3" />
                  Local timezone. A cron picks up scheduled broadcasts every
                  few minutes.
                </p>
              </div>
            )}

            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs">
              <div className="font-medium text-white">{name || "(no name)"}</div>
              <div className="mt-0.5 text-white/60">
                Template: {template?.name ?? "—"} · channel:{" "}
                {channels.find((c) => c.id === channelId)?.name ?? "—"} · audience:{" "}
                {stats ? `${stats.eligible.toLocaleString()} contacts` : "—"}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {audienceMode === "all" && (
                  <Badge
                    variant="outline"
                    className="border-white/15 bg-white/5 text-white/80"
                  >
                    All contacts
                  </Badge>
                )}
                {audienceMode === "tags" &&
                  selectedTags.map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="border-white/15 bg-white/5 text-white/80"
                    >
                      #{t}
                    </Badge>
                  ))}
                {lastActiveAfter && (
                  <Badge
                    variant="outline"
                    className="border-white/15 bg-white/5 text-white/80"
                  >
                    Active since {lastActiveAfter}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={step === 1 || busy}
          onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
          className="border-white/10 bg-white/5 hover:bg-white/10"
        >
          <ArrowLeft className="mr-1 size-4" />
          Back
        </Button>
        {step < 3 ? (
          <Button
            onClick={next}
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            Continue
            <ArrowRight className="ml-1 size-4" />
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={submit}
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            <Send className="mr-1 size-4" />
            {busy
              ? "Saving…"
              : scheduleMode === "now"
                ? "Save draft"
                : "Schedule broadcast"}
          </Button>
        )}
      </div>
    </div>
  );
}

function MappingRow({
  label,
  entry,
  onChange,
}: {
  label: string;
  entry: MappingEntry;
  onChange: (next: MappingEntry) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-white/10 bg-white/[0.02] p-2.5">
      <div className="w-28">
        <Label className="text-[10px] uppercase text-white/50">{label}</Label>
        <select
          value={entry.source}
          onChange={(e) => {
            const src = e.target.value as MappingEntry["source"];
            onChange(
              src === "contact_name"
                ? { source: "contact_name" }
                : { source: "fixed", value: entry.source === "fixed" ? entry.value : "" },
            );
          }}
          className="mt-1 h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
        >
          <option value="contact_name" className="bg-zinc-900">Contact name</option>
          <option value="fixed" className="bg-zinc-900">Fixed value</option>
        </select>
      </div>
      {entry.source === "fixed" && (
        <div className="flex-1 min-w-[160px]">
          <Label className="text-[10px] uppercase text-white/50">Value</Label>
          <Input
            value={entry.value}
            onChange={(e) =>
              onChange({ source: "fixed", value: e.target.value })
            }
            className="mt-1 h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}
