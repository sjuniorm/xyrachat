import { notFound } from "next/navigation";
import { MessageThread } from "@/components/inbox/message-thread";
import { ContactPanel } from "@/components/inbox/contact-panel";
import { getConversation } from "@/lib/mock-data";

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) return notFound();

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-h-0 min-w-0 flex-1">
        <MessageThread conversation={conversation} />
      </div>
      <ContactPanel conversation={conversation} />
    </div>
  );
}
