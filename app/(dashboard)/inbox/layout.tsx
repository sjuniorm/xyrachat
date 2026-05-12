import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConversationsForCurrentOrg } from "@/lib/inbox/server";
import { adaptConversation } from "@/lib/inbox/adapt";
import { getOrgMembers } from "@/lib/team/server";
import { InboxShell } from "@/components/inbox/inbox-shell";

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [rows, members] = await Promise.all([
    getConversationsForCurrentOrg(),
    getOrgMembers(),
  ]);
  const conversations = rows.map((c) => adaptConversation(c));

  return (
    <InboxShell
      conversations={conversations}
      currentUserId={user.id}
      members={members}
    >
      {children}
    </InboxShell>
  );
}
