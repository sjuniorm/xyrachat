"use client";

import { usePathname } from "next/navigation";
import { ConversationList } from "@/components/inbox/conversation-list";
import { useInboxRefresh } from "@/lib/realtime";
import type { Conversation as UiConversation } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function InboxShell({
  conversations,
  children,
}: {
  conversations: UiConversation[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDetail = pathname !== "/inbox";

  // Refresh server data on any Realtime change to messages/conversations.
  useInboxRefresh();

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
        <ConversationList conversations={conversations} />
      </div>
      <div
        className={cn(
          "h-full min-w-0 flex-1",
          isDetail ? "flex" : "hidden md:flex",
        )}
      >
        {children}
      </div>
    </div>
  );
}
