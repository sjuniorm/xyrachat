"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ConversationList } from "@/components/inbox/conversation-list";
import {
  MessagesRealtimeNotifier,
  NotificationsWatcher,
} from "@/components/inbox/notifications-watcher";
import { useInboxRefresh } from "@/lib/realtime";
import type { Conversation as UiConversation } from "@/lib/mock-data";
import type { TeamMember } from "@/lib/team/server";
import { cn } from "@/lib/utils";

export function InboxShell({
  conversations,
  currentUserId,
  members,
  children,
}: {
  conversations: UiConversation[];
  currentUserId: string;
  members: TeamMember[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDetail = pathname !== "/inbox";

  // Refresh server data on any Realtime change to messages/conversations.
  useInboxRefresh();

  const myConversationIds = useMemo(
    () =>
      conversations
        .filter((c) => c.assigned_agent?.id === currentUserId)
        .map((c) => c.id),
    [conversations, currentUserId],
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={cn(
          "h-full",
          isDetail
            ? "hidden md:flex md:w-80 md:shrink-0"
            : "flex w-full md:w-80 md:shrink-0",
        )}
      >
        <ConversationList
          conversations={conversations}
          currentUserId={currentUserId}
          members={members}
        />
      </div>
      <div
        className={cn(
          "h-full min-w-0 flex-1",
          isDetail ? "flex" : "hidden md:flex",
        )}
      >
        {children}
      </div>

      <NotificationsWatcher
        conversations={conversations}
        currentUserId={currentUserId}
      />
      <MessagesRealtimeNotifier
        currentUserId={currentUserId}
        myConversationIds={myConversationIds}
      />
    </div>
  );
}
