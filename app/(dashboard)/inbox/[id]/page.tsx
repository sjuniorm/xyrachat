import { notFound, redirect } from "next/navigation";
import { MessageThread } from "@/components/inbox/message-thread";
import { ContactPanel } from "@/components/inbox/contact-panel";
import {
  getConversationDetail,
  getMessagesForConversation,
} from "@/lib/inbox/server";
import { adaptConversation } from "@/lib/inbox/adapt";
import { getOrgMembers } from "@/lib/team/server";
import { createClient } from "@/lib/supabase/server";

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [detail, messages, members] = await Promise.all([
    getConversationDetail(id),
    getMessagesForConversation(id),
    getOrgMembers(),
  ]);
  if (!detail) return notFound();

  const conversation = adaptConversation(detail, messages);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-h-0 min-w-0 flex-1">
        <MessageThread
          conversation={conversation}
          initialMessageRows={messages}
          assignedToId={detail.assigned_to}
          status={detail.status}
          members={members}
          currentUserId={user.id}
          lastInboundAt={detail.last_inbound_at}
        />
      </div>
      <ContactPanel conversation={conversation} />
    </div>
  );
}
