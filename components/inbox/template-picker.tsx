"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getApprovedTemplatesForChannel,
  type PickerTemplate,
} from "@/lib/templates/actions";
import { countVariables, applyVariables } from "@/lib/templates/types";

// Pull the BODY text out of a template's component array.
function bodyTextOf(t: PickerTemplate): string {
  const body = t.components.find((c) => c.type === "BODY") as
    | { type: "BODY"; text: string }
    | undefined;
  return body?.text ?? "";
}

const HAS_VAR = /\{\{\s*\d+\s*\}\}/;

// The picker only fills BODY variables. A template with a variable in its TEXT
// header or a dynamic URL button would be sent missing that parameter and Meta
// rejects it ("number of parameters does not match"). Hide those so the agent
// never hits a guaranteed failure — they stay usable from the Templates page /
// broadcasts where every variable is collected.
function isPickerSendable(t: PickerTemplate): boolean {
  for (const c of t.components) {
    if (c.type === "HEADER" && (c as { format?: string }).format === "TEXT") {
      if (HAS_VAR.test((c as { text?: string }).text ?? "")) return false;
    }
    if (c.type === "BUTTONS") {
      const buttons = (c as { buttons?: Array<{ type?: string; url?: string }> }).buttons ?? [];
      for (const b of buttons) {
        if (b.type === "URL" && b.url && HAS_VAR.test(b.url)) return false;
      }
    }
  }
  return true;
}

// WhatsApp template picker for the inbox composer. The ONLY compliant way to
// message a WhatsApp contact outside the 24-hour customer-service window —
// lists the org's approved templates for this channel, fills {{N}} body
// variables, and sends via the WA send route as type:"template".
export function TemplatePicker({
  conversationId,
  channelId,
  contactName,
  emphasize = false,
  children,
}: {
  conversationId: string;
  channelId?: string;
  contactName: string;
  // When true, render as a filled/primary CTA (used outside the 24h window).
  emphasize?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<PickerTemplate[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [selected, setSelected] = useState<PickerTemplate | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load approved templates when the popover opens (once per open).
  useEffect(() => {
    if (!open) return;
    if (!channelId) {
      setError("This conversation has no WhatsApp channel.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getApprovedTemplatesForChannel(channelId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const sendable = res.templates.filter(isPickerSendable);
        setTemplates(sendable);
        setHiddenCount(res.templates.length - sendable.length);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, channelId]);

  function pick(t: PickerTemplate) {
    const n = countVariables(bodyTextOf(t));
    // Prefill {{1}} with the contact's first name — the overwhelmingly common
    // first variable. The agent can edit any of them before sending.
    const seeded = Array.from({ length: n }, (_, i) =>
      i === 0 ? (contactName.split(/\s+/)[0] ?? "") : "",
    );
    setValues(seeded);
    setSelected(t);
  }

  function reset() {
    setSelected(null);
    setValues([]);
  }

  async function send() {
    if (!selected) return;
    const body = bodyTextOf(selected);
    const n = countVariables(body);
    if (values.slice(0, n).some((v) => !v.trim())) {
      toast.error("Fill in every variable before sending.");
      return;
    }
    setSending(true);
    try {
      const components =
        n > 0
          ? [
              {
                type: "body",
                parameters: values.slice(0, n).map((v) => ({ type: "text", text: v.trim() })),
              },
            ]
          : [];
      const res = await fetch("/api/channels/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          type: "template",
          templateName: selected.name,
          templateLanguage: selected.language,
          templateComponents: components,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error ?? `Send failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Template sent");
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setSending(false);
    }
  }

  const body = selected ? bodyTextOf(selected) : "";
  const numVars = selected ? countVariables(body) : 0;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            type="button"
            size="sm"
            variant={emphasize ? "default" : "ghost"}
            className={
              emphasize
                ? "h-8 gap-1.5 xyra-gradient border-0 text-white hover:opacity-90"
                : "h-8 gap-1.5 text-white/70 hover:bg-white/5 hover:text-white"
            }
          >
            <FileText className="size-4" />
            Template
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-24px))] border-white/10 p-0"
      >
        {!selected ? (
          <div className="max-h-[20rem] overflow-y-auto p-2">
            <p className="px-1 pb-1.5 text-[11px] font-medium text-white/50">
              Approved templates
            </p>
            {loading ? (
              <div className="flex items-center gap-2 px-1 py-3 text-xs text-white/50">
                <Loader2 className="size-3.5 animate-spin" /> Loading…
              </div>
            ) : error ? (
              <p className="px-1 py-3 text-xs text-red-300">{error}</p>
            ) : templates.length === 0 ? (
              <p className="px-1 py-3 text-xs text-white/50">
                No approved templates yet. Create one under Templates, and use it
                here once Meta approves it.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => pick(t)}
                      className="w-full rounded-md px-2 py-1.5 text-left hover:bg-white/5"
                    >
                      <span className="block truncate font-mono text-xs text-white">
                        {t.name}
                      </span>
                      <span className="line-clamp-2 text-[11px] text-white/50">
                        {bodyTextOf(t) || "(no body)"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hiddenCount > 0 && (
              <p className="mt-2 px-1 text-[10px] text-white/40">
                {hiddenCount} template{hiddenCount === 1 ? "" : "s"} with header/button
                variables hidden — send those from the Templates page.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 p-3">
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white"
            >
              <ChevronLeft className="size-3" /> Templates
            </button>
            <p className="font-mono text-xs text-white">{selected.name}</p>
            {numVars > 0 && (
              <div className="space-y-1.5">
                {Array.from({ length: numVars }, (_, i) => (
                  <div key={i}>
                    <Label className="text-[10px] text-white/50">
                      Variable {`{{${i + 1}}}`}
                    </Label>
                    <Input
                      value={values[i] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                      className="h-7 text-xs"
                      placeholder={`Value for {{${i + 1}}}`}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-2">
              <p className="text-[10px] text-white/40">Preview</p>
              <p className="whitespace-pre-wrap text-xs text-white/80">
                {applyVariables(body, values) || "(no body)"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={sending}
              onClick={send}
              className="h-8 w-full xyra-gradient border-0 text-white hover:opacity-90"
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : "Send template"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
