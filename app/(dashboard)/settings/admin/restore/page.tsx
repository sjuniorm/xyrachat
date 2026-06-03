import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOperatorProfile } from "@/lib/admin/operator";
import {
  RestoreAdmin,
  type DeletedOrg,
  type DeletedConversation,
  type DeletedContact,
} from "./restore-admin";

// Operator-only support-undo console. Restores soft-deleted workspaces (via the
// restore_org RPC, migration 033) and individual conversations / contacts —
// so client incidents don't need hand-written SQL. Access = owner of the Xyra
// operator org (XYRA_OPERATOR_ORG_ID), or any owner pre-launch.
export default async function RestoreAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  if (!isOperatorProfile(profile.role, profile.org_id)) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="text-sm text-white/60">
          This page is for Xyra Chat operators only.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();

  // All orgs split into deleted / active. Active ids gate the per-row lists so
  // we never offer to restore an orphan inside a deleted workspace.
  const { data: allOrgs } = await admin
    .from("organizations")
    .select("id, name, deleted_at");
  const orgName: Record<string, string> = {};
  const deletedOrgRows: Array<{ id: string; name: string; deleted_at: string }> = [];
  const activeOrgIds: string[] = [];
  for (const o of allOrgs ?? []) {
    orgName[o.id] = (o.name as string) ?? "—";
    if (o.deleted_at) {
      deletedOrgRows.push({ id: o.id, name: orgName[o.id], deleted_at: o.deleted_at });
    } else {
      activeOrgIds.push(o.id);
    }
  }

  // Member counts for the deleted workspaces.
  const memberCount: Record<string, number> = {};
  if (deletedOrgRows.length > 0) {
    const { data: members } = await admin
      .from("profiles")
      .select("id, org_id")
      .in(
        "org_id",
        deletedOrgRows.map((o) => o.id),
      );
    for (const m of members ?? []) {
      memberCount[m.org_id] = (memberCount[m.org_id] ?? 0) + 1;
    }
  }

  const [{ data: convs }, { data: cons }] = await Promise.all([
    admin
      .from("conversations")
      .select(
        "id, org_id, deleted_at, channel:channels!conversations_channel_id_fkey(type), contact:contacts!conversations_contact_id_fkey(name)",
      )
      .not("deleted_at", "is", null)
      .in("org_id", activeOrgIds)
      .order("deleted_at", { ascending: false })
      .limit(100),
    admin
      .from("contacts")
      .select("id, org_id, name, phone, email, instagram_id, telegram_id, deleted_at")
      .not("deleted_at", "is", null)
      .in("org_id", activeOrgIds)
      .order("deleted_at", { ascending: false })
      .limit(100),
  ]);

  const orgs: DeletedOrg[] = deletedOrgRows.map((o) => ({
    id: o.id,
    name: o.name,
    deletedAt: o.deleted_at,
    memberCount: memberCount[o.id] ?? 0,
  }));

  // PostgREST embeds a to-one relation as an object at runtime, but supabase-js
  // types it as an array — normalize to the first element either way.
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const conversations: DeletedConversation[] = (convs ?? []).map((c) => {
    const contact = one(
      c.contact as unknown as { name: string | null } | { name: string | null }[] | null,
    );
    const channel = one(
      c.channel as unknown as { type: string | null } | { type: string | null }[] | null,
    );
    return {
      id: c.id as string,
      orgName: orgName[c.org_id as string] ?? "—",
      contactName: contact?.name ?? "Unknown contact",
      channel: channel?.type ?? "—",
      deletedAt: c.deleted_at as string,
    };
  });

  const contacts: DeletedContact[] = (cons ?? []).map((c) => ({
    id: c.id as string,
    orgName: orgName[c.org_id as string] ?? "—",
    name: (c.name as string) || "Unnamed contact",
    identifier:
      (c.phone as string) ||
      (c.email as string) ||
      (c.instagram_id as string) ||
      (c.telegram_id as string) ||
      "",
    deletedAt: c.deleted_at as string,
  }));

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Restore (operator)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Support-undo for soft-deleted data. Reactivate a whole workspace or
            cherry-pick conversations and contacts — no SQL required.
          </p>
        </header>
        <RestoreAdmin orgs={orgs} conversations={conversations} contacts={contacts} />
      </div>
    </div>
  );
}
