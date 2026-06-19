"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Send, AlertCircle, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type TemplateButton,
  type TemplateCategory,
  type TemplateComponent,
  applyVariables,
  countVariables,
  normalizeTemplateName,
} from "@/lib/templates/types";
import { createTemplate, editTemplate } from "@/lib/templates/actions";

const CATEGORIES: Array<{
  value: TemplateCategory;
  label: string;
  blurb: string;
}> = [
  {
    value: "MARKETING",
    label: "Marketing",
    blurb: "Promotions, offers, newsletters. Requires opt-in tracking.",
  },
  {
    value: "UTILITY",
    label: "Utility",
    blurb: "Order updates, account alerts, reminders.",
  },
  {
    value: "AUTHENTICATION",
    label: "Authentication",
    blurb: "One-time passcodes for sign-in or verification.",
  },
];

const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "es", label: "Spanish" },
  { code: "es_MX", label: "Spanish (Mexico)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "ca", label: "Catalan" },
];

type Header =
  | { kind: "none" }
  | { kind: "text"; text: string }
  | { kind: "media"; format: "IMAGE" | "VIDEO" | "DOCUMENT" };

export type TemplateEdit = {
  templateId: string;
  channelId: string;
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
  exampleValues: Record<string, string[]>;
};

// Reverse of buildComponents(): turn a stored components array back into the
// header / body / footer / buttons editor state so an existing template can be
// edited in the same builder.
function decompose(components: TemplateComponent[]): {
  header: Header;
  body: string;
  footer: string;
  buttons: TemplateButton[];
} {
  let header: Header = { kind: "none" };
  let body = "";
  let footer = "";
  let buttons: TemplateButton[] = [];
  for (const c of components) {
    if (c.type === "HEADER") {
      if (c.format === "TEXT" && "text" in c) {
        header = { kind: "text", text: c.text };
      } else if (
        c.format === "IMAGE" ||
        c.format === "VIDEO" ||
        c.format === "DOCUMENT"
      ) {
        header = { kind: "media", format: c.format };
      }
    } else if (c.type === "BODY") {
      body = c.text;
    } else if (c.type === "FOOTER") {
      footer = c.text;
    } else if (c.type === "BUTTONS") {
      buttons = c.buttons;
    }
  }
  return { header, body, footer, buttons };
}

export function TemplateBuilder({
  channels,
  edit,
}: {
  channels: Array<{ id: string; name: string }>;
  edit?: TemplateEdit;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const isEdit = !!edit;
  const initial = edit ? decompose(edit.components) : null;

  const [channelId, setChannelId] = useState(
    edit?.channelId ?? channels[0]?.id ?? "",
  );
  const [name, setName] = useState(edit?.name ?? "");
  const [language, setLanguage] = useState(edit?.language ?? "en_US");
  const [category, setCategory] = useState<TemplateCategory>(
    edit?.category ?? "UTILITY",
  );

  const [header, setHeader] = useState<Header>(
    initial?.header ?? { kind: "none" },
  );
  const [body, setBody] = useState(
    initial?.body ??
      "Hi {{1}}, thanks for reaching out — we got your message about {{2}}.",
  );
  const [footer, setFooter] = useState(initial?.footer ?? "");
  const [buttons, setButtons] = useState<TemplateButton[]>(
    initial?.buttons ?? [],
  );

  // Examples for the {{N}} placeholders. Used both by the preview AND
  // included in the Meta submission so reviewers see what real content
  // looks like.
  const [headerExamples, setHeaderExamples] = useState<string[]>(
    edit?.exampleValues?.header ?? [],
  );
  // Uploaded media-header sample → Meta upload handle (example.header_handle).
  const [headerHandle, setHeaderHandle] = useState<string | null>(
    edit?.exampleValues?.header_handle?.[0] ?? null,
  );
  const [uploadingHeader, setUploadingHeader] = useState(false);

  async function uploadHeaderMedia(file: File) {
    setUploadingHeader(true);
    setHeaderHandle(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/channels/whatsapp/template-media", { method: "POST", body: fd });
      const j = (await res.json().catch(() => null)) as { handle?: string; error?: string } | null;
      if (!res.ok || !j?.handle) {
        toast.error(j?.error ?? "Couldn't upload the sample file.");
        return;
      }
      setHeaderHandle(j.handle);
      toast.success("Sample uploaded.");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploadingHeader(false);
    }
  }
  const [bodyExamples, setBodyExamples] = useState<string[]>(
    edit?.exampleValues?.body ?? ["Junior", "your order"],
  );

  const bodyVarCount = useMemo(() => countVariables(body), [body]);
  const headerVarCount = useMemo(
    () => (header.kind === "text" ? countVariables(header.text) : 0),
    [header],
  );

  // Keep example arrays in lock-step with detected variable counts so the
  // inputs render correctly. Trim or pad on every change.
  const ensureLen = (arr: string[], n: number): string[] => {
    if (arr.length === n) return arr;
    if (arr.length > n) return arr.slice(0, n);
    return [...arr, ...new Array(n - arr.length).fill("")];
  };
  const fixedBodyExamples = ensureLen(bodyExamples, bodyVarCount);
  const fixedHeaderExamples = ensureLen(headerExamples, headerVarCount);

  const previewBody = useMemo(
    () => applyVariables(body, fixedBodyExamples),
    [body, fixedBodyExamples],
  );
  const previewHeader = useMemo(
    () =>
      header.kind === "text"
        ? applyVariables(header.text, fixedHeaderExamples)
        : null,
    [header, fixedHeaderExamples],
  );

  function buildComponents(): TemplateComponent[] {
    const out: TemplateComponent[] = [];
    if (header.kind === "text" && header.text.trim()) {
      out.push({ type: "HEADER", format: "TEXT", text: header.text.trim() });
    } else if (header.kind === "media") {
      out.push({ type: "HEADER", format: header.format });
    }
    out.push({ type: "BODY", text: body.trim() });
    if (footer.trim()) {
      out.push({ type: "FOOTER", text: footer.trim() });
    }
    if (buttons.length > 0) {
      out.push({ type: "BUTTONS", buttons });
    }
    return out;
  }

  function submit() {
    if (!isEdit && !channelId) {
      toast.error("Pick a WhatsApp channel.");
      return;
    }
    const normalized = normalizeTemplateName(name);
    if (!isEdit && !normalized) {
      toast.error("Add a template name.");
      return;
    }
    if (!body.trim()) {
      toast.error("Add a body — every template needs one.");
      return;
    }
    if (buttons.some((b) => !b.text.trim())) {
      toast.error("All buttons need a label.");
      return;
    }

    if (header.kind === "media" && !headerHandle) {
      toast.error("Upload a sample file for the media header so Meta can review it.");
      return;
    }

    const exampleValues = {
      ...(fixedHeaderExamples.length > 0 ? { header: fixedHeaderExamples } : {}),
      ...(fixedBodyExamples.length > 0 ? { body: fixedBodyExamples } : {}),
      ...(header.kind === "media" && headerHandle ? { header_handle: [headerHandle] } : {}),
    };

    startTransition(async () => {
      const res = edit
        ? await editTemplate({
            templateId: edit.templateId,
            category,
            components: buildComponents(),
            exampleValues,
          })
        : await createTemplate({
            channelId,
            name: normalized,
            language,
            category,
            components: buildComponents(),
            exampleValues,
          });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        isEdit
          ? "Resubmitted to Meta — refresh status from the templates page."
          : "Submitted to Meta — refresh status from the templates page.",
      );
      router.push("/templates");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* LEFT — form */}
      <div className="space-y-6">
        {/* Setup */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="channel" className="text-xs">
                WhatsApp channel
              </Label>
              <select
                id="channel"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={isEdit}
                className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white disabled:opacity-60"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id} className="bg-zinc-900">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="name" className="text-xs">
                  Template name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setName((v) => normalizeTemplateName(v))}
                  placeholder="order_shipped_v1"
                  disabled={isEdit}
                  className="mt-1 font-mono disabled:opacity-60"
                />
                <p className="mt-1 text-[10px] text-white/50">
                  {isEdit
                    ? "Name can't change on Meta — create a new template to rename."
                    : "Lowercase letters, numbers and underscores. Auto-converted."}
                </p>
              </div>
              <div>
                <Label htmlFor="language" className="text-xs">
                  Language
                </Label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={isEdit}
                  className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white disabled:opacity-60"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code} className="bg-zinc-900">
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Category</Label>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`rounded-lg border p-3 text-left text-xs transition ${
                      category === c.value
                        ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/10 text-white"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <div className="font-medium text-white">{c.label}</div>
                    <div className="mt-0.5 text-[11px] text-white/60">{c.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Header */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Header (optional)</CardTitle>
            <div className="flex gap-1">
              {(["none", "text", "media"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    setHeader(
                      k === "none"
                        ? { kind: "none" }
                        : k === "text"
                          ? { kind: "text", text: "" }
                          : { kind: "media", format: "IMAGE" },
                    )
                  }
                  className={`h-7 rounded px-2.5 text-[11px] ${
                    header.kind === k
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:bg-white/5"
                  }`}
                >
                  {k === "none" ? "None" : k === "text" ? "Text" : "Media"}
                </button>
              ))}
            </div>
          </CardHeader>
          {header.kind === "text" && (
            <CardContent className="space-y-3">
              <Input
                value={header.text}
                onChange={(e) =>
                  setHeader({ kind: "text", text: e.target.value })
                }
                maxLength={60}
                placeholder="Your order is on the way!"
              />
              {headerVarCount > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wide text-white/50">
                    Example values
                  </Label>
                  {fixedHeaderExamples.map((v, i) => (
                    <Input
                      key={i}
                      value={v}
                      onChange={(e) => {
                        const next = [...fixedHeaderExamples];
                        next[i] = e.target.value;
                        setHeaderExamples(next);
                      }}
                      placeholder={`{{${i + 1}}} example`}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          )}
          {header.kind === "media" && (
            <CardContent>
              <div className="flex gap-2">
                {(["IMAGE", "VIDEO", "DOCUMENT"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setHeader({ kind: "media", format: f })}
                    className={`h-8 rounded-md border px-3 text-xs ${
                      header.format === f
                        ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/10 text-white"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                <label className="text-xs text-white/70">Sample file (for Meta review)</label>
                <input
                  type="file"
                  accept={header.format === "IMAGE" ? "image/jpeg,image/png" : header.format === "VIDEO" ? "video/mp4" : "application/pdf"}
                  disabled={uploadingHeader}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadHeaderMedia(f);
                  }}
                  className="block w-full text-xs text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
                />
                <p className="text-[10px] text-white/40">
                  {uploadingHeader
                    ? "Uploading…"
                    : headerHandle
                      ? "✓ Sample uploaded — Meta will use it to review this media header."
                      : "Required. JPEG/PNG for image, MP4 for video, PDF for document. Uploaded to Meta; only the review handle is stored."}
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Body */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Body</CardTitle>
            <p className="mt-1 text-[11px] text-white/50">
              Use {"{{1}}"}, {"{{2}}"} etc for variables. They must be
              sequential starting at 1.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={1024}
              placeholder="Hi {{1}}, your order #{{2}} has shipped."
            />
            <div className="flex items-center justify-between text-[10px] text-white/40">
              <span>
                {body.length}/1024 chars · {bodyVarCount} variable
                {bodyVarCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => setBody((b) => `${b} {{${bodyVarCount + 1}}}`)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-white/60 hover:bg-white/5 hover:text-white"
              >
                <Plus className="size-3" />
                Insert {`{{${bodyVarCount + 1}}}`}
              </button>
            </div>
            {bodyVarCount > 0 && (
              <div className="space-y-1.5 rounded-md border border-white/10 bg-white/[0.02] p-3">
                <Label className="text-[10px] uppercase tracking-wide text-white/50">
                  Example values for Meta review
                </Label>
                {fixedBodyExamples.map((v, i) => (
                  <Input
                    key={i}
                    value={v}
                    onChange={(e) => {
                      const next = [...fixedBodyExamples];
                      next[i] = e.target.value;
                      setBodyExamples(next);
                    }}
                    placeholder={`{{${i + 1}}} — e.g. "Junior"`}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Footer (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              maxLength={60}
              placeholder="Reply STOP to unsubscribe"
            />
          </CardContent>
        </Card>

        {/* Buttons */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Buttons (optional, max 3)</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={buttons.length >= 3}
              onClick={() =>
                setButtons((bs) => [...bs, { type: "QUICK_REPLY", text: "" }])
              }
              className="border-white/10 bg-white/5 hover:bg-white/10"
            >
              <Plus className="mr-1 size-3" />
              Add button
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {buttons.length === 0 && (
              <p className="text-xs text-white/50">
                Quick replies, call-to-action URL, or phone-number buttons.
              </p>
            )}
            {buttons.map((b, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-md border border-white/10 bg-white/[0.02] p-2.5"
              >
                <div className="w-32">
                  <Label className="text-[10px] uppercase text-white/50">Type</Label>
                  <select
                    value={b.type}
                    onChange={(e) => {
                      const next = [...buttons];
                      const t = e.target.value as TemplateButton["type"];
                      if (t === "URL") {
                        next[i] = { type: "URL", text: b.text, url: "" };
                      } else if (t === "PHONE_NUMBER") {
                        next[i] = {
                          type: "PHONE_NUMBER",
                          text: b.text,
                          phone_number: "",
                        };
                      } else {
                        next[i] = { type: "QUICK_REPLY", text: b.text };
                      }
                      setButtons(next);
                    }}
                    className="mt-1 h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
                  >
                    <option value="QUICK_REPLY" className="bg-zinc-900">
                      Quick reply
                    </option>
                    <option value="URL" className="bg-zinc-900">
                      Open URL
                    </option>
                    <option value="PHONE_NUMBER" className="bg-zinc-900">
                      Call phone
                    </option>
                  </select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <Label className="text-[10px] uppercase text-white/50">Label</Label>
                  <Input
                    value={b.text}
                    onChange={(e) => {
                      const next = [...buttons];
                      next[i] = { ...next[i], text: e.target.value } as TemplateButton;
                      setButtons(next);
                    }}
                    maxLength={25}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                {b.type === "URL" && (
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-[10px] uppercase text-white/50">URL</Label>
                    <Input
                      value={b.url}
                      onChange={(e) => {
                        const next = [...buttons];
                        next[i] = { ...b, url: e.target.value };
                        setButtons(next);
                      }}
                      placeholder="https://"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                )}
                {b.type === "PHONE_NUMBER" && (
                  <div className="flex-1 min-w-[160px]">
                    <Label className="text-[10px] uppercase text-white/50">Phone</Label>
                    <Input
                      value={b.phone_number}
                      onChange={(e) => {
                        const next = [...buttons];
                        next[i] = { ...b, phone_number: e.target.value };
                        setButtons(next);
                      }}
                      placeholder="+34 600 000 000"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setButtons((bs) => bs.filter((_, j) => j !== i))
                  }
                  className="self-start mt-5 text-white/40 hover:text-red-300"
                  aria-label="Remove button"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            disabled={busy}
            onClick={submit}
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            {busy ? (
              isEdit ? (
                "Resubmitting…"
              ) : (
                "Submitting…"
              )
            ) : (
              <>
                <Send className="mr-1.5 size-4" />
                {isEdit ? "Resubmit to Meta" : "Submit to Meta"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* RIGHT — preview */}
      <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-white/40">
          <MessageSquare className="size-3.5" />
          Preview
        </div>
        <div className="rounded-xl bg-[#0c1810] p-4 shadow-lg ring-1 ring-white/5">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#005c4b] p-2.5 text-sm text-white shadow-sm">
            {header.kind === "text" && previewHeader && (
              <div className="mb-1.5 text-[13px] font-semibold">
                {previewHeader}
              </div>
            )}
            {header.kind === "media" && (
              <div className="-m-1 mb-1.5 flex h-32 items-center justify-center rounded-lg bg-black/30 text-[10px] text-white/40">
                [{header.format} media]
              </div>
            )}
            <div className="whitespace-pre-wrap text-[14px] leading-snug">
              {previewBody || (
                <span className="text-white/40">(body preview)</span>
              )}
            </div>
            {footer.trim() && (
              <div className="mt-1.5 text-[11px] text-white/60">{footer}</div>
            )}
            <div className="mt-1 text-right text-[10px] text-white/40">
              12:34 ✓✓
            </div>
          </div>
          {buttons.length > 0 && (
            <div className="ml-auto mt-1.5 flex max-w-[85%] flex-col gap-1">
              {buttons.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  className="rounded-md bg-white/10 px-3 py-2 text-center text-[12px] font-medium text-white/90 hover:bg-white/15"
                >
                  {b.text || `Button ${i + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-start gap-1.5 rounded-md border border-amber-400/20 bg-amber-400/5 p-2.5 text-[11px] text-amber-200/80">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span>
            {isEdit ? (
              <>
                Resubmitting sends the edit to Meta for review. The currently
                approved version keeps sending until the edit is approved. Meta
                limits edits to roughly once per day.
              </>
            ) : (
              <>
                Once submitted, Meta reviews the template (usually under 10 min
                for utility, up to 24h for marketing). You can edit an approved
                or rejected template later — not while it&apos;s pending.
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
