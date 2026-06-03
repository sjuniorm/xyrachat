"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CornerDownRight,
  Languages,
  Paperclip,
  Send,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Conversation, Message } from "@/lib/mock-data";
import { TOP_LANGUAGES, languageLabel } from "@/lib/i18n/languages";
import { EmojiPicker } from "@/components/inbox/emoji-picker";
import { SavedRepliesPopover } from "@/components/inbox/saved-replies-popover";

type AssistAction =
  | "improve"
  | "friendlier"
  | "professional"
  | "shorter"
  | "longer"
  | "fix_grammar"
  | "translate";

const ASSIST_ACTIONS: { value: AssistAction; label: string }[] = [
  { value: "improve", label: "Improve writing" },
  { value: "friendlier", label: "Make friendlier" },
  { value: "professional", label: "Make more professional" },
  { value: "shorter", label: "Make shorter" },
  { value: "longer", label: "Make longer" },
  { value: "fix_grammar", label: "Fix typos & grammar" },
];

export function Composer({
  conversation,
  quotedMessage,
  onClearQuote,
  hasBotAssigned,
}: {
  conversation: Conversation;
  quotedMessage?: Message;
  onClearQuote: () => void;
  hasBotAssigned: boolean;
}) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [pending, setPending] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [previousDraft, setPreviousDraft] = useState<string | null>(null);
  const [otherLangValue, setOtherLangValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Auto-grow textarea up to 120px.
  function autoGrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }
  useEffect(autoGrow, [text]);

  // Insert a saved reply — append below any existing draft, then focus.
  function insertSavedReply(body: string) {
    setText((prev) => (prev.trim() ? `${prev.replace(/\n+$/, "")}\n${body}` : body));
    requestAnimationFrame(() => taRef.current?.focus());
  }

  // Cmd/Ctrl+Enter to send, Cmd/Ctrl+J for AI Assist, Cmd/Ctrl+L for Suggest.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === "enter") {
        e.preventDefault();
        send();
      } else if (k === "j") {
        if (!text.trim()) return;
        e.preventDefault();
        setAssistOpen(true);
      } else if (k === "l") {
        if (!hasBotAssigned) return;
        e.preventDefault();
        suggestReply();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, hasBotAssigned]);

  async function send() {
    if (!text.trim() || pending) return;
    setPending(true);
    // Internal notes don't hit a provider — they're org-only. Stored in
    // the messages table with is_internal_note=true so they appear in
    // the thread (via Realtime) but never reach the customer.
    if (internal) {
      try {
        const res = await fetch("/api/inbox/internal-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            content: text.trim(),
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(err?.error ?? "Couldn't save the note.");
          return;
        }
        toast.success("Internal note saved");
        setText("");
        onClearQuote();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Network error");
      } finally {
        setPending(false);
      }
      return;
    }
    try {
      const endpoint =
        conversation.channel === "instagram"
          ? "/api/channels/instagram/send"
          : conversation.channel === "whatsapp"
            ? "/api/channels/whatsapp/send"
            : conversation.channel === "telegram"
              ? "/api/channels/telegram/send"
              : conversation.channel === "email"
                ? "/api/channels/email/send"
                : null;
      if (!endpoint) {
        toast.error(
          `Sending on ${conversation.channel} isn't wired up yet.`,
        );
        return;
      }
      const payload =
        conversation.channel === "whatsapp"
          ? {
              conversationId: conversation.id,
              content: text.trim(),
              type: "text" as const,
              repliedToMessageId: quotedMessage?.id ?? undefined,
            }
          : {
              conversationId: conversation.id,
              content: text.trim(),
              repliedToMessageId: quotedMessage?.id ?? undefined,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(
          (data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : null) ?? `Send failed (HTTP ${res.status})`,
        );
        return;
      }
      setText("");
      onClearQuote();
      // Immediate re-fetch so the outbound bubble appears without waiting
      // on Realtime/polling. Realtime + the 5s poller still run as backups.
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  function showUndoToast(prev: string) {
    setPreviousDraft(prev);
    toast("Replaced with AI rewrite", {
      action: {
        label: "Undo",
        onClick: () => {
          setText(prev);
          setPreviousDraft(null);
        },
      },
      duration: 6000,
    });
  }

  async function runAssist(action: AssistAction, language?: string) {
    if (!text.trim() || pending) return;
    setAssistOpen(false);
    const prev = text;
    setPending(true);
    try {
      const res = await fetch("/api/ai/message-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          action,
          language,
          conversation_id: conversation.id,
          channel_id: conversation.channel,
        }),
      });
      const data = await res.json();
      if (!data?.text) throw new Error("no text");
      setText(data.text);
      requestAnimationFrame(() => {
        taRef.current?.focus();
        const len = data.text.length;
        taRef.current?.setSelectionRange(len, len);
      });
      showUndoToast(prev);
    } catch {
      toast.error("AI rewrite failed");
    } finally {
      setPending(false);
    }
  }

  function insertEmoji(char: string) {
    const ta = taRef.current;
    if (!ta) {
      setText((t) => t + char);
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + char + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + char.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function suggestReply() {
    if (pending || !hasBotAssigned) return;
    const prev = text;
    setPending(true);
    try {
      const res = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversation.id }),
      });
      const data = await res.json();
      if (!data?.text) throw new Error("no text");
      setText(data.text);
      requestAnimationFrame(() => taRef.current?.focus());
      if (prev) showUndoToast(prev);
    } catch {
      toast.error("Suggest reply failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-t border-white/5 p-3">
      {quotedMessage && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
          <CornerDownRight className="mt-0.5 size-3.5 text-white/50" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-white/70">Replying to</p>
            <p className="truncate text-white/60">{quotedMessage.body}</p>
          </div>
          <button
            type="button"
            onClick={onClearQuote}
            className="text-white/50 hover:text-white"
            aria-label="Cancel quote"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div
        className={cn(
          "rounded-2xl border bg-white/5 transition",
          internal
            ? "border-amber-400/40 bg-amber-400/5"
            : "border-white/10 focus-within:border-[color:var(--xyra-glow)]",
        )}
      >
        <Textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder={internal ? "Internal note (only your team sees this)…" : "Type a message…"}
          aria-label="Compose message"
          className={cn(
            // field-sizing-fixed overrides shadcn's default `field-sizing-content`,
            // which would otherwise grow the textarea width to fit long unbroken
            // strings and push horizontal scroll on mobile.
            "field-sizing-fixed resize-none border-0 bg-transparent px-3.5 py-3 text-sm text-white placeholder:text-white/40 focus-visible:ring-0 transition",
            pending && "animate-pulse",
          )}
          style={{ minHeight: 44 }}
        />

        <div className="flex flex-wrap items-center gap-1 border-t border-white/5 px-2 py-2">
          <Popover open={assistOpen} onOpenChange={setAssistOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!text.trim() || pending}
                className="h-8 gap-1.5 px-2 text-xs"
                aria-label="AI Assist (⌘J)"
                title="AI Assist (⌘J)"
              >
                <span className="inline-flex size-5 items-center justify-center rounded-full xyra-gradient">
                  <Sparkles className="size-3 text-white" />
                </span>
                <span className="hidden sm:inline">AI Assist</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              collisionPadding={12}
              className="w-[min(20rem,calc(100vw-24px))] border-white/10 p-2"
            >
              <div className="flex flex-col gap-0.5">
                {ASSIST_ACTIONS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => runAssist(a.value)}
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-white/5"
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              <div className="my-2 flex items-center gap-2 px-1 text-[10px] uppercase tracking-wide text-white/50">
                <Languages className="size-3" />
                <span>Translate to</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <button
                type="button"
                onClick={() =>
                  runAssist("translate", conversation.detected_language ?? "en")
                }
                className="mb-1 flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5"
              >
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="size-3.5 text-[color:var(--xyra-glow)]" />
                  Customer's language
                </span>
                <span className="shrink-0 text-[10px] text-white/50">
                  {languageLabel(conversation.detected_language)}
                </span>
              </button>

              <div className="flex flex-wrap gap-1">
                {TOP_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => runAssist("translate", l.code)}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 hover:border-[color:var(--xyra-glow)]/40 hover:bg-white/10 hover:text-white"
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-1">
                <input
                  type="text"
                  value={otherLangValue}
                  onChange={(e) => setOtherLangValue(e.target.value)}
                  placeholder="Other… (e.g. Polish)"
                  className="h-7 min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2 text-xs text-white placeholder:text-white/40 focus:border-[color:var(--xyra-glow)] focus:outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!otherLangValue.trim()}
                  onClick={() => {
                    runAssist("translate", otherLangValue.trim());
                    setOtherLangValue("");
                  }}
                >
                  Go
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!hasBotAssigned || pending}
            onClick={suggestReply}
            className="h-8 gap-1.5 px-2 text-xs disabled:opacity-50"
            title={
              hasBotAssigned
                ? "Suggest reply (⌘L)"
                : "Assign a bot in Settings → Bots to enable suggestions"
            }
            aria-label="Suggest reply"
          >
            <span className="inline-flex size-5 items-center justify-center rounded-full xyra-gradient">
              <Zap className="size-3 text-white" />
            </span>
            <span className="hidden sm:inline">Suggest</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-white/60 hover:text-white"
            onClick={() => toast.message("Attachments coming soon")}
            aria-label="Attach file"
          >
            <Paperclip className="size-4" />
          </Button>

          <EmojiPicker onSelect={insertEmoji} disabled={pending} />

          <SavedRepliesPopover onInsert={insertSavedReply} disabled={pending} />

          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-white/70">
              <Switch
                checked={internal}
                onCheckedChange={setInternal}
                aria-label="Internal note"
              />
              <span className="hidden sm:inline">Internal note</span>
            </label>
            <Button
              type="button"
              size="sm"
              onClick={send}
              disabled={!text.trim() || pending}
              className={cn(
                "h-8 gap-1.5 border-0 text-white",
                internal
                  ? "bg-amber-500 hover:bg-amber-500/90"
                  : "xyra-gradient hover:opacity-90",
              )}
              title="Send (⌘↵)"
            >
              <Send className="size-3.5" />
              Send
            </Button>
          </div>
        </div>
      </div>

      {previousDraft !== null && !pending && (
        <p className="mt-1.5 px-2 text-[11px] text-white/40">
          AI rewrite applied — undo available for 6s
        </p>
      )}
    </div>
  );
}
