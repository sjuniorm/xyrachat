"use client";

import { useState } from "react";
import {
  Check,
  CheckCheck,
  Copy,
  Image as ImageIcon,
  Languages,
  MessageSquareReply,
  Paperclip,
  Sparkle,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CalendarClock, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { languageLabel } from "@/lib/i18n/languages";

const SUPPORT_BOOKING_URL = process.env.NEXT_PUBLIC_SUPPORT_BOOKING_URL;
import { VoiceNoteTranscript } from "@/components/inbox/voice-note-transcript";
import type { Message } from "@/lib/mock-data";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DeliveryTicks({
  status,
}: {
  status?: Message["delivery_status"];
}) {
  if (!status) return null;
  if (status === "sent") {
    return <Check className="size-3 text-white/60" aria-label="sent" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="size-3 text-white/60" aria-label="delivered" />;
  }
  if (status === "read") {
    return (
      <CheckCheck
        className="size-3 text-[color:var(--xyra-glow)]"
        aria-label="read"
      />
    );
  }
  return null;
}

export function MessageBubble({
  message,
  showHeader,
  isLastInGroup = true,
  quotedMessage,
  onReplyWithQuote,
  onTranslated,
  onRateBot,
  onSubmitBotReason,
}: {
  message: Message;
  showHeader: boolean;
  isLastInGroup?: boolean;
  quotedMessage?: Message;
  onReplyWithQuote: (m: Message) => void;
  onTranslated: (messageId: string, translation: NonNullable<Message["metadata"]>["translation"]) => void;
  onRateBot?: (messageId: string, rating: "up" | "down") => void;
  onSubmitBotReason?: (messageId: string, reason: string) => void;
}) {
  const isOutbound = message.direction === "outbound";
  const isInternal = message.is_internal_note;
  const [showOriginal, setShowOriginal] = useState(false);
  const [translating, setTranslating] = useState(false);
  const translation = message.metadata?.translation;
  const aiMeta = message.metadata?.ai_assisted;

  const bubbleClass = cn(
    // No max-width here — the parent column owns the width budget so the
    // constraint has a definite containing block to compute against.
    "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
    isInternal
      ? "bg-amber-400/15 text-amber-100 ring-1 ring-amber-400/30"
      : isOutbound
        ? "xyra-gradient text-white"
        : "bg-white/[0.07] text-white ring-1 ring-white/10",
  );

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.body);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  }

  async function translate() {
    setTranslating(true);
    try {
      const res = await fetch("/api/ai/translate-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: message.id }),
      });
      const data = await res.json();
      if (!res.ok || !data?.translation) {
        // The endpoint returns actionable bodies (402 quota, 502 API error) —
        // surface them instead of silently doing nothing.
        const reason =
          data?.message ||
          data?.error ||
          (res.status === 402
            ? "AI tokens exhausted for this month."
            : `Translation failed (${res.status})`);
        throw new Error(reason);
      }
      onTranslated(message.id, data.translation);
      setShowOriginal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not translate");
    } finally {
      setTranslating(false);
    }
  }

  const renderedBody = (() => {
    if (!translation) return message.body;
    if (showOriginal) return message.body;
    return translation.translated_text;
  })();

  // A voice note's transcript is rendered under the <audio> player by
  // VoiceNoteTranscript. Since we ALSO store it as message.content (for the
  // bot, RAG + search), suppress the duplicate body line for that case.
  const transcriptText = message.metadata?.transcription?.text;
  const isAudioTranscriptBody =
    !!transcriptText &&
    renderedBody === transcriptText &&
    (message.attachments?.some((a) => a.type === "audio") ?? false);

  return (
    <div
      className={cn(
        "flex w-full",
        isOutbound ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          // 75% width cap moved up here — gives the bubble's max-content a
          // real percentage to compute against, so short messages like "test"
          // no longer collapse to min-content (one character per line).
          "flex w-fit max-w-[80%] min-w-0 flex-col gap-0.5 sm:max-w-[75%]",
          isOutbound ? "items-end" : "items-start",
        )}
      >
        {showHeader && !isOutbound && (
          <span
            suppressHydrationWarning
            className="px-1 text-xs text-white/50"
          >
            {formatTime(message.created_at)}
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isOutbound || isInternal}>
            <button
              type="button"
              className={cn(
                "group/bubble cursor-pointer text-left",
                isOutbound ? "cursor-default" : "",
              )}
              onContextMenu={(e) => {
                if (isOutbound || isInternal) return;
                // Let DropdownMenu open via right-click. Radix doesn't support
                // this natively — fallback: open programmatically below.
                e.preventDefault();
                (e.currentTarget as HTMLButtonElement).click();
              }}
            >
              <div className={bubbleClass}>
                {quotedMessage && (
                  <div
                    className={cn(
                      "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs",
                      isOutbound
                        ? "border-white/40 bg-white/10 text-white/80"
                        : "border-[color:var(--xyra-glow)] bg-white/5 text-white/70",
                    )}
                  >
                    <p className="line-clamp-2">{quotedMessage.body}</p>
                  </div>
                )}

                {message.metadata?.email?.subject && (
                  <div
                    className={cn(
                      "mb-1.5 border-b pb-1.5 text-xs font-semibold",
                      isOutbound
                        ? "border-white/30 text-white/90"
                        : "border-white/15 text-white/80",
                    )}
                  >
                    {message.metadata.email.subject}
                  </div>
                )}
                {message.metadata?.ig_story && (
                  <div
                    className={cn(
                      "mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                      isOutbound
                        ? "bg-white/15 text-white/85"
                        : "bg-[linear-gradient(135deg,#833AB4_0%,#FD1D1D_50%,#FCB045_100%)] text-white",
                    )}
                  >
                    <Sparkle className="size-3" />
                    Story reply
                  </div>
                )}
                {message.attachments?.map((att, i) => (
                  <div key={i} className="mb-1.5">
                    {att.type === "image" ? (
                      <BubbleImage src={att.url} alt={att.name} />
                    ) : att.type === "video" ? (
                      <video
                        src={att.url}
                        controls
                        className="max-h-64 rounded-lg"
                      />
                    ) : att.type === "audio" ? (
                      <div className="space-y-1">
                        <audio src={att.url} controls className="w-full" />
                        <VoiceNoteTranscript
                          messageId={message.id}
                          isOutbound={isOutbound}
                          initialTranscript={message.metadata?.transcription?.text}
                        />
                      </div>
                    ) : att.type === "story_mention" ? (
                      <div className="flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-xs">
                        <ImageIcon className="size-3.5" />
                        <span className="truncate">Mentioned you in a story</span>
                        {att.url && (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto underline text-white/70 hover:text-white"
                          >
                            view
                          </a>
                        )}
                      </div>
                    ) : att.type === "share" ? (
                      <div className="flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-xs">
                        <Paperclip className="size-3.5" />
                        <span className="truncate">Shared a post</span>
                        {att.url && (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto underline text-white/70 hover:text-white"
                          >
                            open
                          </a>
                        )}
                      </div>
                    ) : att.url ? (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-xs hover:bg-black/30"
                      >
                        <Paperclip className="size-3.5" />
                        <span className="truncate underline-offset-2 hover:underline">
                          {att.name}
                        </span>
                        {att.size && <span className="text-white/50">{att.size}</span>}
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-xs">
                        <Paperclip className="size-3.5" />
                        <span className="truncate">{att.name}</span>
                        {att.size && (
                          <span className="text-white/50">{att.size}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {renderedBody && !isAudioTranscriptBody && (
                  <p className="whitespace-pre-wrap break-words">
                    {renderedBody}
                  </p>
                )}

                {translation && !showOriginal && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/60">
                    <Languages className="size-3" />
                    <span>
                      translated from{" "}
                      {translation.source_lang && translation.source_lang !== "und"
                        ? languageLabel(translation.source_lang)
                        : "the original"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowOriginal(true);
                      }}
                      className="underline hover:text-white"
                    >
                      show original
                    </button>
                  </div>
                )}
                {translation && showOriginal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOriginal(false);
                    }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-white/60 underline hover:text-white"
                  >
                    <Languages className="size-3" /> show translation
                  </button>
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isOutbound ? "end" : "start"} className="w-52">
            <DropdownMenuItem onClick={translate} disabled={translating}>
              <Languages className="mr-2 size-4" />
              {translating ? "Translating…" : "Translate this message"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyText}>
              <Copy className="mr-2 size-4" />
              Copy text
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onReplyWithQuote(message)}>
              <MessageSquareReply className="mr-2 size-4" />
              Reply with quote
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {message.metadata?.ig_reactions && message.metadata.ig_reactions.length > 0 && (
          <div
            className={cn(
              "-mt-1 inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-xs ring-1 ring-white/10",
              isOutbound ? "self-end" : "self-start",
            )}
          >
            {message.metadata.ig_reactions.slice(0, 3).map((r, i) => (
              <span key={i}>{r.emoji}</span>
            ))}
            {message.metadata.ig_reactions.length > 3 && (
              <span className="text-white/50">
                +{message.metadata.ig_reactions.length - 3}
              </span>
            )}
          </div>
        )}

        {message.ai_activity && message.ai_activity.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-1 px-1",
              isOutbound ? "justify-end self-end" : "self-start",
            )}
          >
            {message.ai_activity.map((a, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  a.kind === "lead"
                    ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20"
                    : "bg-[color:var(--xyra-purple)]/10 text-[color:var(--xyra-glow)] ring-1 ring-[color:var(--xyra-purple)]/20",
                )}
              >
                {a.kind === "lead" ? (
                  <Check className="size-2.5" />
                ) : a.kind === "translate" ? (
                  <Languages className="size-2.5" />
                ) : (
                  <Sparkle className="size-2.5" />
                )}
                {a.label}
              </span>
            ))}
          </div>
        )}

        {message.is_bot_reply && onRateBot && (
          <BotFeedbackControl
            messageId={message.id}
            rating={message.bot_feedback ?? null}
            reason={message.bot_feedback_reason ?? null}
            onRate={onRateBot}
            onSubmitReason={onSubmitBotReason}
          />
        )}

        {isLastInGroup && (
          <div
            className={cn(
              "flex items-center gap-1.5 px-1 text-[11px] text-white/45",
              isOutbound ? "flex-row-reverse" : "",
            )}
          >
            <span suppressHydrationWarning>{formatTime(message.created_at)}</span>
            {isOutbound && <DeliveryTicks status={message.delivery_status} />}
            {aiMeta && (
              <span
                title={`AI ${aiMeta.action}`}
                className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/60"
              >
                ✨
              </span>
            )}
            {isInternal && (
              <span className="rounded-full bg-amber-400/15 px-1.5 text-[10px] text-amber-200">
                internal note
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 👍 / 👎 on a bot reply, with an optional "what went wrong" note on a 👎 and a
// "Book a call" link (when NEXT_PUBLIC_SUPPORT_BOOKING_URL is set). Rating and
// note are independent: thumbs toggle the rating; the pencil opens the note.
function BotFeedbackControl({
  messageId,
  rating,
  reason,
  onRate,
  onSubmitReason,
}: {
  messageId: string;
  rating: "up" | "down" | null;
  reason: string | null;
  onRate: (messageId: string, rating: "up" | "down") => void;
  onSubmitReason?: (messageId: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(reason ?? "");
  const canNote = Boolean(onSubmitReason);

  function clickDown() {
    const willBeDown = rating !== "down";
    onRate(messageId, "down");
    if (willBeDown && canNote) {
      setDraft(reason ?? "");
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  function openNote() {
    setDraft(reason ?? "");
    setOpen(true);
  }

  function save() {
    onSubmitReason?.(messageId, draft.trim());
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex items-center gap-1 self-end px-1">
          <button
            type="button"
            aria-label="Good AI reply"
            title="Good AI reply"
            onClick={() => onRate(messageId, "up")}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-full transition-colors",
              rating === "up"
                ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                : "text-white/40 hover:bg-white/10 hover:text-white/70",
            )}
          >
            <ThumbsUp className="size-3" />
          </button>
          <button
            type="button"
            aria-label="Bad AI reply"
            title="Bad AI reply"
            onClick={clickDown}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-full transition-colors",
              rating === "down"
                ? "bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30"
                : "text-white/40 hover:bg-white/10 hover:text-white/70",
            )}
          >
            <ThumbsDown className="size-3" />
          </button>
          {canNote && rating === "down" && (
            <button
              type="button"
              aria-label={reason ? "Edit feedback note" : "Add feedback note"}
              title={reason ? "Edit feedback note" : "Add a note"}
              onClick={openNote}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full transition-colors",
                reason
                  ? "text-[color:var(--xyra-glow)] hover:bg-white/10"
                  : "text-white/40 hover:bg-white/10 hover:text-white/70",
              )}
            >
              <PenLine className="size-3" />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-72 space-y-2">
        <p className="text-xs font-medium text-white/80">What went wrong? (optional)</p>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="e.g. wrong info, off-tone, ignored the question…"
          className="text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          {SUPPORT_BOOKING_URL ? (
            <a
              href={SUPPORT_BOOKING_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-white/60 underline hover:text-white"
            >
              <CalendarClock className="size-3" /> Book a call
            </a>
          ) : (
            <span />
          )}
          <Button size="sm" onClick={save} className="xyra-gradient text-white">
            Send feedback
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Inbox image attachment with a graceful fallback — the /api/media proxy can
// 404 (deleted object / lost access) and provider CDN URLs can rot, so a broken
// <img> is replaced with a small "image unavailable" chip instead of a torn icon.
function BubbleImage({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-xs text-white/50">
        <ImageIcon className="size-3.5" />
        Image unavailable
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="max-h-64 rounded-lg"
      onError={() => setBroken(true)}
    />
  );
}
