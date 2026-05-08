"use client";

import { usePathname } from "next/navigation";
import { ConversationList } from "@/components/inbox/conversation-list";
import { cn } from "@/lib/utils";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDetail = pathname !== "/inbox";

  return (
    <div className="flex min-h-0 flex-1">
      {/* Conversation list — full width on mobile when no conversation selected,
          fixed 320px on md+ always. */}
      <div
        className={cn(
          "h-full",
          isDetail
            ? "hidden md:flex md:w-80 md:shrink-0"
            : "flex w-full md:w-80 md:shrink-0",
        )}
      >
        <ConversationList />
      </div>

      {/* Detail area: thread + contact panel.
          Hidden on mobile when no conversation selected (mobile shows list only). */}
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
