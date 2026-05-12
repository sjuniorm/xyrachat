"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChannelIcon } from "@/components/ui/channel-icon";
import { cn } from "@/lib/utils";
import { timeAgo, type Conversation } from "@/lib/mock-data";

const STATUS_DOT: Record<Conversation["status"], string> = {
  open: "bg-emerald-400",
  closed: "bg-zinc-500",
  snoozed: "bg-amber-400",
  bot: "bg-[color:var(--xyra-purple)]",
};

export function ConversationItem({
  conversation,
  active,
  selectionEnabled = false,
  selected = false,
  onToggleSelect,
}: {
  conversation: Conversation;
  active: boolean;
  selectionEnabled?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, selected: boolean) => void;
}) {
  const initials = conversation.contact.name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const hasFooter =
    conversation.unread_count > 0 || Boolean(conversation.assigned_agent);

  return (
    <div className={cn("group/row relative", selected && "bg-white/[0.07]")}>
      {/* Click-to-select checkbox. Visible on hover OR when selection is active. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={
          selected ? "Deselect conversation" : "Select conversation"
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect?.(conversation.id, !selected);
        }}
        className={cn(
          "absolute top-3.5 left-2.5 z-10 inline-flex size-4 items-center justify-center rounded border transition",
          selected
            ? "border-[color:var(--xyra-purple)] bg-[color:var(--xyra-purple)] opacity-100"
            : "border-white/30 bg-black/30 hover:border-white/60",
          selectionEnabled || selected
            ? "opacity-100"
            : "opacity-0 group-hover/row:opacity-100",
        )}
      >
        {selected && <Check className="size-3 text-white" />}
      </button>

      <Link
        href={`/inbox/${conversation.id}`}
        onClick={(e) => {
          // If a selection is active, treat row click as toggle (UX expectation
          // in most inboxes — click anywhere on a row to add/remove from set).
          if (selectionEnabled) {
            e.preventDefault();
            onToggleSelect?.(conversation.id, !selected);
          }
        }}
        className={cn(
          "flex items-start gap-3 px-3 py-3 transition-colors",
          active && !selected ? "bg-white/10" : "hover:bg-white/5",
          "border-b border-white/[0.04]",
        )}
      >
        <div className="relative shrink-0">
          <Avatar className="size-10">
            <AvatarImage src={conversation.contact.avatar} alt="" />
            <AvatarFallback className="bg-[color:var(--xyra-purple)] text-xs text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -right-1 -bottom-1">
            <ChannelIcon channel={conversation.channel} size="sm" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {/* Row 1: name + status dot + time */}
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-medium text-white">
                {conversation.contact.name}
              </p>
              <span
                className={cn(
                  "inline-block size-1.5 shrink-0 rounded-full",
                  STATUS_DOT[conversation.status],
                )}
                aria-label={`status: ${conversation.status}`}
              />
            </div>
            <span
              suppressHydrationWarning
              className="shrink-0 text-[11px] text-white/40"
            >
              {timeAgo(conversation.last_message_at)}
            </span>
          </div>

          {/* Row 2: last message preview */}
          <p className="mt-0.5 truncate text-xs text-white/60">
            {conversation.last_message_preview || (
              <span className="italic text-white/30">no messages yet</span>
            )}
          </p>

          {/* Row 3 (only when needed): agent + unread */}
          {hasFooter && (
            <div className="mt-1.5 flex items-center justify-end gap-2">
              {conversation.assigned_agent && (
                <Avatar className="size-4">
                  <AvatarImage
                    src={conversation.assigned_agent.avatar}
                    alt={conversation.assigned_agent.name}
                  />
                  <AvatarFallback className="text-[8px]">
                    {conversation.assigned_agent.name[0]}
                  </AvatarFallback>
                </Avatar>
              )}
              {conversation.unread_count > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--xyra-purple)] px-1.5 text-[11px] font-medium text-white">
                  {conversation.unread_count}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
