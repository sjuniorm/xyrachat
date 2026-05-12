"use client";

import Link from "next/link";
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
}: {
  conversation: Conversation;
  active: boolean;
}) {
  const initials = conversation.contact.name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      href={`/inbox/${conversation.id}`}
      className={cn(
        "group flex items-start gap-3 px-3 py-3 transition-colors",
        active ? "bg-white/10" : "hover:bg-white/5",
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
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-white">
            {conversation.contact.name}
          </p>
          <span
            className={cn(
              "ml-auto inline-block size-2 shrink-0 rounded-full",
              STATUS_DOT[conversation.status],
            )}
            aria-label={`status: ${conversation.status}`}
          />
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <p className="truncate text-xs text-white/60">
            {conversation.last_message_preview}
          </p>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span
            suppressHydrationWarning
            className="text-xs text-white/40"
          >
            {timeAgo(conversation.last_message_at)}
          </span>
          <div className="flex items-center gap-2">
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
        </div>
      </div>
    </Link>
  );
}
