"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChannelIcon, channelLabel } from "@/components/ui/channel-icon";
import { ContactSheetTrigger } from "@/components/inbox/contact-panel";
import { MessageBubble } from "@/components/inbox/message-bubble";
import { Composer } from "@/components/inbox/composer";
import { AssignMenu } from "@/components/inbox/assign-menu";
import { StatusMenu } from "@/components/inbox/status-menu";
import { WhatsAppWindowTimer } from "@/components/inbox/whatsapp-window-timer";
import type { Conversation, Message } from "@/lib/mock-data";
import type { ConversationStatus, MessageRow } from "@/lib/db-types";
import { adaptMessage } from "@/lib/inbox/adapt";
import { useMessages } from "@/lib/realtime";
import {
  setConversationStatus,
  markConversationRead,
  setConversationBotOnly,
} from "@/lib/inbox/actions";
import { rateBotReply, submitBotFeedbackReason } from "@/lib/bots/feedback";
import { formatSnoozeUntil } from "@/lib/inbox/snooze";
import type { TeamMember } from "@/lib/team/server";
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
  botFeedback,
  assignedToId,
  status,
  members,
  currentUserId,
  lastInboundAt,
  bots,
  botOnly,
  botIdOverride,
  botServes,
  botAutoReopensClosed,
}: {
  conversation: Conversation;
  initialMessageRows: MessageRow[];
  botFeedback?: Record<string, { rating: "up" | "down"; reason: string | null }>;
  assignedToId: string | null;
  status: ConversationStatus;
  members: TeamMember[];
  currentUserId: string;
  lastInboundAt: string | null;
  bots: Array<{ id: string; name: string }>;
  botOnly: boolean;
  botIdOverride: string | null;
  botServes: boolean;
  botAutoReopensClosed: boolean | null;
}) {
  const router = useRouter();
  const [closing, startClosing] = useTransition();
  // Subscribe to Supabase Realtime so new inbound/outbound messages appear live.
  const rows = useMessages(conversation.id, initialMessageRows);

  // Read tracking: mark read on open (and refresh the list so the unread badge
  // clears), then keep it read as new messages land while the thread is open.
  const lastRowId = rows.length > 0 ? rows[rows.length - 1].id : null;
  useEffect(() => {
    void markConversationRead(conversation.id).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);
  useEffect(() => {
    if (lastRowId) void markConversationRead(conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRowId]);
  const [localOverrides, setLocalOverrides] = useState<
    Record<string, Partial<Message>>
  >({});

  const messages: Message[] = useMemo(() => {
    return rows.map((r) => {
      const adapted = adaptMessage(r);
      // Hydrate the agent's saved 👍/👎 (+ 👎 note) for bot replies.
      const fb = botFeedback?.[r.id];
      const withFb =
        fb !== undefined && adapted.is_bot_reply
          ? { ...adapted, bot_feedback: fb.rating, bot_feedback_reason: fb.reason }
          : adapted;
      const o = localOverrides[r.id];
      return o ? { ...withFb, ...o } : withFb;
    });
  }, [rows, localOverrides, botFeedback]);

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

  const statusBadge = STATUS_BADGE[conversation.status];
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

  // 👍/👎 a bot reply. Optimistic toggle (clicking the active thumb clears it),
  // reconciled to the server's post-state; reverts on error.
  function rateBot(messageId: string, rating: "up" | "down") {
    const current = messagesById.get(messageId)?.bot_feedback ?? null;
    const optimistic = current === rating ? null : rating;
    setLocalOverrides((prev) => ({
      ...prev,
      [messageId]: { ...(prev[messageId] ?? {}), bot_feedback: optimistic },
    }));
    void rateBotReply(messageId, rating).then((res) => {
      if (!res.ok) {
        toast.error(res.error);
        setLocalOverrides((prev) => ({
          ...prev,
          [messageId]: { ...(prev[messageId] ?? {}), bot_feedback: current },
        }));
        return;
      }
      setLocalOverrides((prev) => ({
        ...prev,
        [messageId]: { ...(prev[messageId] ?? {}), bot_feedback: res.rating },
      }));
    });
  }

  // Save a "what went wrong" note on a 👎 (optimistic; reverts on error).
  function submitReason(messageId: string, reason: string) {
    const prevReason = messagesById.get(messageId)?.bot_feedback_reason ?? null;
    setLocalOverrides((prev) => ({
      ...prev,
      [messageId]: { ...(prev[messageId] ?? {}), bot_feedback_reason: reason || null },
    }));
    void submitBotFeedbackReason(messageId, reason).then((res) => {
      if (!res.ok) {
        toast.error(res.error);
        setLocalOverrides((prev) => ({
          ...prev,
          [messageId]: { ...(prev[messageId] ?? {}), bot_feedback_reason: prevReason },
        }));
        return;
      }
      toast.success("Thanks — feedback sent.");
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
              className={cn("h-5 gap-1 px-1.5 text-[10px]", statusBadge.className)}
            >
              {statusBadge.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/60">
            <ChannelIcon channel={conversation.channel} size="sm" withRing={false} />
            <span>{channelLabel(conversation.channel)}</span>
            {conversation.channel === "whatsapp" && (
              <WhatsAppWindowTimer lastInboundAt={lastInboundAt} />
            )}
            {conversation.status === "snoozed" && conversation.snooze_until && (
              <span
                suppressHydrationWarning
                className="ml-1 text-amber-300/90"
              >
                · Snoozed {formatSnoozeUntil(conversation.snooze_until)}
              </span>
            )}
          </div>
        </div>

        <AssignMenu
          conversationId={conversation.id}
          currentAgentId={assignedToId}
          members={members}
          currentUserId={currentUserId}
        />

        {status !== "closed" && (
          <Button
            variant="outline"
            size="sm"
            disabled={closing}
            onClick={() => {
              startClosing(async () => {
                const fd = new FormData();
                fd.set("conversation_id", conversation.id);
                fd.set("status", "closed");
                const r = await setConversationStatus(fd);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("Conversation closed");
                  router.refresh();
                }
              });
            }}
            className="h-8 shrink-0 gap-1.5 px-2 md:px-3"
            aria-label="Close conversation"
          >
            <X className="size-3.5" />
            <span className="hidden md:inline">Close</span>
          </Button>
        )}

        <ContactSheetTrigger conversation={conversation} />

        <StatusMenu
          conversationId={conversation.id}
          status={status}
          bots={bots}
          botOnly={botOnly}
          botIdOverride={botIdOverride}
        />
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 md:px-6"
        style={{ background: "color-mix(in oklab, var(--xyra-bg) 92%, black)" }}
      >
        <div className="flex flex-col">
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
                  onRateBot={rateBot}
                  onSubmitBotReason={submitReason}
                />
              </div>
            );
          })}
        </div>
      </div>

      {botOnly ? (
        <BotOnlyBar
          conversationId={conversation.id}
          status={status}
          botServes={botServes}
          botAutoReopensClosed={botAutoReopensClosed}
        />
      ) : (
        <Composer
          conversation={conversation}
          quotedMessage={quoted}
          onClearQuote={() => setQuoted(undefined)}
          hasBotAssigned={hasBotAssigned}
        />
      )}
    </div>
  );
}

// Shown in place of the composer when a conversation is in bot-only mode: the
// funnel is automated, so humans don't message here. "Take over" flips bot-only
// off (and the composer returns). The copy + styling reflect whether the bot is
// ACTUALLY replying right now — a bot can be unassigned/deleted after bot-only
// was switched on (dead funnel), and the gate still respects closed/snoozed
// status, so we don't falsely claim "fully automated" in those states.
function BotOnlyBar({
  conversationId,
  status,
  botServes,
  botAutoReopensClosed,
}: {
  conversationId: string;
  status: ConversationStatus;
  botServes: boolean;
  botAutoReopensClosed: boolean | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // A closed conversation only stays silent if the serving bot does NOT
  // auto-reopen; with auto-reopen on, the gate reopens + replies on the next
  // inbound, so we must not claim silence (the misleading direction).
  const closedSilent = status === "closed" && botAutoReopensClosed !== true;

  // Warn when the bot can't/won't actually reply, so the agent doesn't assume
  // the funnel is handled while the customer gets silence.
  const warn = !botServes || closedSilent || status === "snoozed";

  const message = !botServes
    ? "No bot is assigned to this channel — customers get no reply. Assign a bot or take over."
    : status === "snoozed"
      ? "This conversation is snoozed — the bot resumes when the snooze ends."
      : status === "closed"
        ? botAutoReopensClosed === true
          ? "This conversation is closed, but the bot reopens it and replies on the next message."
          : botAutoReopensClosed === false
            ? "This conversation is closed — the bot won't reply until it's reopened."
            : "This conversation is closed — the bot replies only if its settings auto-reopen closed chats."
        : "Replies here are fully automated — take over to message the customer yourself.";

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t px-4 py-3",
        warn
          ? "border-amber-400/30 bg-amber-400/5"
          : "border-white/5 bg-[color:var(--xyra-purple)]/5",
      )}
    >
      {warn ? (
        <TriangleAlert className="size-4 shrink-0 text-amber-300" />
      ) : (
        <Bot className="size-4 shrink-0 text-[color:var(--xyra-glow)]" />
      )}
      <p className="min-w-0 flex-1 text-xs text-white/70">
        <span className="font-medium text-white/90">Bot-only mode.</span> {message}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        className="h-8 shrink-0"
        onClick={() => {
          startTransition(async () => {
            const r = await setConversationBotOnly(conversationId, false);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("You've taken over this conversation");
            router.refresh();
          });
        }}
      >
        Take over
      </Button>
    </div>
  );
}
