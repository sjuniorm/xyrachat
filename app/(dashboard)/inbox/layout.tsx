import { getConversationsForCurrentOrg } from "@/lib/inbox/server";
import { adaptConversation } from "@/lib/inbox/adapt";
import { InboxShell } from "@/components/inbox/inbox-shell";

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const rows = await getConversationsForCurrentOrg();
  const conversations = rows.map((c) => adaptConversation(c));
  return <InboxShell conversations={conversations}>{children}</InboxShell>;
}
