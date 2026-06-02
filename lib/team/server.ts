import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileRow, ProfileRole, Availability } from "@/lib/db-types";

export type TeamMember = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: ProfileRole;
  availability: Availability;
  joined_at: string;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: ProfileRole;
  invited_at: string;
};

type MembershipWithProfile = {
  user_id: string;
  role: ProfileRole;
  created_at: string;
  profiles: {
    id: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
    availability: Availability | null;
    deleted_at: string | null;
  } | null;
};

const MEMBER_SELECT =
  "user_id, role, created_at, profiles!memberships_user_id_fkey(id, email, full_name, avatar_url, availability, deleted_at)";

/**
 * The members of an org, sourced from `memberships` (NOT profiles.org_id) so a
 * teammate whose *active* workspace is a different org still appears here with
 * their per-org role. Resolved via the admin client because the caller (active
 * in this org) can't read the profile rows of members active elsewhere under
 * RLS. The caller is authenticated + org-scoped first.
 */
async function loadOrgMembers(orgId: string): Promise<TeamMember[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("memberships")
    .select(MEMBER_SELECT)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  return ((data as MembershipWithProfile[] | null) ?? [])
    .filter((m) => m.profiles && !m.profiles.deleted_at)
    .map((m) => ({
      id: m.user_id,
      email: m.profiles?.email ?? null,
      full_name: m.profiles?.full_name ?? null,
      avatar_url: m.profiles?.avatar_url ?? null,
      role: m.role,
      availability: m.profiles?.availability ?? "offline",
      joined_at: m.created_at,
    }));
}

/**
 * Returns the current user's profile (incl. active org_id), the members of
 * their active org, and any pending (un-confirmed) invites tagged for it.
 */
export async function getTeamSnapshot(): Promise<{
  me: ProfileRow | null;
  orgId: string | null;
  members: TeamMember[];
  pendingInvites: PendingInvite[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { me: null, orgId: null, members: [], pendingInvites: [] };

  const { data: me } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (me as ProfileRow | null) ?? null;
  const orgId = profile?.org_id ?? null;
  if (!orgId) {
    return { me: profile, orgId: null, members: [], pendingInvites: [] };
  }

  const members = await loadOrgMembers(orgId);

  // Pending invites — service-role-only API. List, then filter by metadata +
  // email_confirmed_at IS NULL.
  const admin = createAdminClient();
  const pendingInvites: PendingInvite[] = [];
  try {
    const { data: authUsers } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    for (const u of authUsers?.users ?? []) {
      if (u.email_confirmed_at) continue; // already accepted
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      if (meta.invited_org_id !== orgId) continue;
      pendingInvites.push({
        id: u.id,
        email: u.email ?? "(no email)",
        role: (meta.invited_role as ProfileRole) ?? "agent",
        invited_at: u.created_at,
      });
    }
  } catch (err) {
    console.error("[team] listing invites failed", err);
  }

  return { me: profile, orgId, members, pendingInvites };
}

/**
 * Just the members of the caller's active org. Used by the Assign dropdown in
 * the message thread (lighter than getTeamSnapshot). Membership-sourced.
 */
export async function getOrgMembers(): Promise<TeamMember[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: me } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return [];

  const members = await loadOrgMembers(me.org_id);
  // Assign menu prefers name order.
  return members.sort((a, b) =>
    (a.full_name ?? "").localeCompare(b.full_name ?? ""),
  );
}
