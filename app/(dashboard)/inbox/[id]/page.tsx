import { redirect } from "next/navigation";
import { MessageThread } from "@/components/inbox/message-thread";
import { ContactPanel } from "@/components/inbox/contact-panel";
import {
  getConversationDetail,
  getMessagesForConversation,
  getMyBotFeedbackForConversation,
  resolveServingBot,
  requireInboxAccess,
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
  await requireInboxAccess();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [detail, messages, myBotFeedback, members, botsRes] = await Promise.all([
    getConversationDetail(id),
    getMessagesForConversation(id),
    getMyBotFeedbackForConversation(id),
    getOrgMembers(),
    // Active bots for the StatusMenu "Use bot" picker (RLS scopes to the org).
    supabase
      .from("bots")
      .select("id, name")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);
  // A deleted (or not-yours / invalid) conversation should drop the user back on
  // the inbox list + empty state, not a hard 404 — e.g. after deleting the chat
  // you're viewing.
  if (!detail) redirect("/inbox");

  const bots = (botsRes.data as Array<{ id: string; name: string }> | null) ?? [];
  // Resolve the serving bot for the bot-only bar: whether a bot replies at all
  // (a bot can be removed after bot-only was enabled) and whether it auto-reopens
  // a closed chat (so the "closed" copy is accurate, not misleading).
  const serving = detail.bot_only
    ? await resolveServingBot(
        detail.channel_id,
        detail.bot_id_override,
        detail.routed_bot_id,
        detail.org_id,
      )
    : { serves: false, autoReopensClosed: null };
  const conversation = adaptConversation(detail, messages);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-h-0 min-w-0 flex-1">
        <MessageThread
          conversation={conversation}
          initialMessageRows={messages}
          botFeedback={myBotFeedback}
          assignedToId={detail.assigned_to}
          status={detail.status}
          members={members}
          currentUserId={user.id}
          lastInboundAt={detail.last_inbound_at}
          bots={bots}
          botOnly={detail.bot_only}
          botIdOverride={detail.bot_id_override}
          botServes={serving.serves}
          botAutoReopensClosed={serving.autoReopensClosed}
        />
      </div>
      <ContactPanel conversation={conversation} />
    </div>
  );
}
