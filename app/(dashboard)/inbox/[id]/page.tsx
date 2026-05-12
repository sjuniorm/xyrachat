import { notFound } from "next/navigation";
import { MessageThread } from "@/components/inbox/message-thread";
import { ContactPanel } from "@/components/inbox/contact-panel";
import {
  getConversationDetail,
  getMessagesForConversation,
} from "@/lib/inbox/server";
import { adaptConversation } from "@/lib/inbox/adapt";

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, messages] = await Promise.all([
    getConversationDetail(id),
    getMessagesForConversation(id),
  ]);
  if (!detail) return notFound();

  const conversation = adaptConversation(detail, messages);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-h-0 min-w-0 flex-1">
        <MessageThread
          conversation={conversation}
          initialMessageRows={messages}
        />
      </div>
      <ContactPanel conversation={conversation} />
    </div>
  );
}
