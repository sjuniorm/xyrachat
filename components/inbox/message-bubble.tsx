"use client";

import { useState } from "react";
import {
  Check,
  CheckCheck,
  Copy,
  Languages,
  MessageSquareReply,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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
  quotedMessage,
  onReplyWithQuote,
  onTranslated,
}: {
  message: Message;
  showHeader: boolean;
  quotedMessage?: Message;
  onReplyWithQuote: (m: Message) => void;
  onTranslated: (messageId: string, translation: NonNullable<Message["metadata"]>["translation"]) => void;
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
    "rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
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
      if (data?.translation) {
        onTranslated(message.id, data.translation);
        setShowOriginal(false);
      }
    } catch {
      toast.error("Could not translate");
    } finally {
      setTranslating(false);
    }
  }

  const renderedBody = (() => {
    if (!translation) return message.body;
    if (showOriginal) return message.body;
    return translation.translated_text;
  })();

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
          "flex w-fit max-w-[80%] min-w-0 flex-col gap-1 sm:max-w-[75%]",
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

                {message.attachments?.map((att, i) => (
                  <div key={i} className="mb-1.5">
                    {att.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.url}
                        alt={att.name}
                        className="max-h-64 rounded-lg"
                      />
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

                <p className="whitespace-pre-wrap break-words">
                  {renderedBody}
                </p>

                {translation && !showOriginal && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/60">
                    <Languages className="size-3" />
                    <span>translated from {translation.source_lang}</span>
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
      </div>
    </div>
  );
}
