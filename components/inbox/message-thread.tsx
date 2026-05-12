"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MoreVertical, UserPlus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChannelIcon, channelLabel } from "@/components/ui/channel-icon";
import { ContactSheetTrigger } from "@/components/inbox/contact-panel";
import { MessageBubble } from "@/components/inbox/message-bubble";
import { Composer } from "@/components/inbox/composer";
import type { Conversation, Message } from "@/lib/mock-data";
import type { MessageRow } from "@/lib/db-types";
import { adaptMessage } from "@/lib/inbox/adapt";
import { useMessages } from "@/lib/realtime";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<
  Conversation["status"],
  { label: string; className: string }
> = {
  open: { label: "Open", className: "bg-emerald-400/15 text-emerald-300 border-emerald-400/20" },
  closed: { label: "Closed", className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
  snoozed: { label: "Snoozed", className: "bg-amber-400/15 text-amber-300 border-amber-400/30" },
  bot: {
    label: "Bot handling",
    className: "bg-[color:var(--xyra-purple)]/20 text-[color:var(--xyra-glow)] border-[color:var(--xyra-purple)]/30",
  },
};

// Group: returns true if this message starts a new "block" (different sender,
// or >5min gap) and should show a header timestamp.
function shouldShowHeader(prev: Message | undefined, current: Message): boolean {
  if (!prev) return true;
  if (prev.direction !== current.direction) return true;
  const gap =
    new Date(current.created_at).getTime() - new Date(prev.created_at).getTime();
  return gap > 5 * 60 * 1000;
}

export function MessageThread({
  conversation,
  initialMessageRows,
}: {
  conversation: Conversation;
  initialMessageRows: MessageRow[];
}) {
  // Subscribe to Supabase Realtime so new inbound/outbound messages appear live.
  const rows = useMessages(conversation.id, initialMessageRows);
  const [localOverrides, setLocalOverrides] = useState<
    Record<string, Partial<Message>>
  >({});

  const messages: Message[] = useMemo(() => {
    return rows.map((r) => {
      const adapted = adaptMessage(r);
      const o = localOverrides[r.id];
      return o ? { ...adapted, ...o } : adapted;
    });
  }, [rows, localOverrides]);

  const [quoted, setQuoted] = useState<Message | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on conversation change OR when a new message arrives.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.id, rows.length]);

  const initials = conversation.contact.name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const status = STATUS_BADGE[conversation.status];
  const messagesById = useMemo(() => {
    const m = new Map<string, Message>();
    for (const msg of messages) m.set(msg.id, msg);
    return m;
  }, [messages]);

  function applyTranslation(
    messageId: string,
    translation: NonNullable<Message["metadata"]>["translation"],
  ) {
    setLocalOverrides((prev) => {
      const existing = prev[messageId] ?? {};
      const existingMeta = (existing.metadata ?? {}) as Message["metadata"];
      return {
        ...prev,
        [messageId]: {
          ...existing,
          metadata: { ...existingMeta, translation },
        },
      };
    });
  }

  // Mock: bot is "assigned" when the conversation status === "bot".
  const hasBotAssigned = conversation.status === "bot";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/5 px-3 md:gap-3 md:px-4">
        <Link
          href="/inbox"
          className="md:hidden inline-flex size-8 items-center justify-center rounded-md text-white/70 hover:bg-white/5 hover:text-white"
          aria-label="Back to inbox"
        >
          <ArrowLeft className="size-4" />
        </Link>

        <Avatar className="size-8">
          <AvatarImage src={conversation.contact.avatar} alt="" />
          <AvatarFallback className="bg-[color:var(--xyra-purple)] text-xs text-white">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-white">
              {conversation.contact.name}
            </p>
            <Badge
              variant="outline"
              className={cn("h-5 gap-1 px-1.5 text-[10px]", status.className)}
            >
              {status.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/60">
            <ChannelIcon channel={conversation.channel} size="sm" withRing={false} />
            <span>{channelLabel(conversation.channel)}</span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2 md:px-3"
              aria-label="Assign agent"
            >
              <UserPlus className="size-4 md:hidden" />
              <span className="hidden md:inline">Assign</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">Agents</DropdownMenuLabel>
            <DropdownMenuItem>Junior Mylle (you)</DropdownMenuItem>
            <DropdownMenuItem>Ana García</DropdownMenuItem>
            <DropdownMenuItem>Marco Bianchi</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Unassign</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {conversation.status !== "closed" ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2 md:px-3"
            aria-label="Close conversation"
          >
            <X className="size-3.5" />
            <span className="hidden md:inline">Close</span>
          </Button>
        ) : null}

        <ContactSheetTrigger conversation={conversation} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="More">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>Mark as unread</DropdownMenuItem>
            <DropdownMenuItem>Snooze…</DropdownMenuItem>
            <DropdownMenuItem>Add tag…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Block contact</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 md:px-6"
        style={{ background: "color-mix(in oklab, var(--xyra-bg) 92%, black)" }}
      >
        <div className="mx-auto flex max-w-3xl flex-col">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const isFirstInGroup = shouldShowHeader(prev, m);
            const isLastInGroup = !next || shouldShowHeader(m, next);
            // 16px between groups, 2px within a group (WhatsApp-style).
            const marginClass =
              i === 0 ? "" : isFirstInGroup ? "mt-4" : "mt-0.5";
            return (
              <div key={m.id} className={marginClass}>
                <MessageBubble
                  message={m}
                  showHeader={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                  quotedMessage={
                    m.replied_to_message_id
                      ? messagesById.get(m.replied_to_message_id)
                      : undefined
                  }
                  onReplyWithQuote={setQuoted}
                  onTranslated={applyTranslation}
                />
              </div>
            );
          })}
        </div>
      </div>

      <Composer
        conversation={conversation}
        quotedMessage={quoted}
        onClearQuote={() => setQuoted(undefined)}
        hasBotAssigned={hasBotAssigned}
      />
    </div>
  );
}
