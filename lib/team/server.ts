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

/**
 * Returns the current user's profile (incl. org_id), the active members of
 * their org, and any pending (un-confirmed) invites tagged for that org.
 *
 * Pending invites are derived from auth.users where email_confirmed_at IS NULL
 * AND raw_user_meta_data.invited_org_id matches. We don't keep a separate
 * invites table — Supabase auth already tracks the state.
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

  // Members (the org-peers RLS policy from migration 007 makes this readable).
  const { data: memberRows } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role, availability, created_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const members: TeamMember[] = (memberRows ?? []).map((r) => ({
    id: r.id as string,
    email: (r.email as string | null) ?? null,
    full_name: (r.full_name as string | null) ?? null,
    avatar_url: (r.avatar_url as string | null) ?? null,
    role: r.role as ProfileRole,
    availability: (r.availability as Availability) ?? "offline",
    joined_at: r.created_at as string,
  }));

  // Pending invites — service-role-only API. List, then filter by metadata +
  // email_confirmed_at IS NULL.
  const admin = createAdminClient();
  const pendingInvites: PendingInvite[] = [];
  try {
    // page size 200 — fine for any normal org. Loop pages if it ever grows.
    const { data: authUsers } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of authUsers?.users ?? []) {
      if (u.email_confirmed_at) continue; // already accepted
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      if (meta.invited_org_id !== orgId) continue;
      pendingInvites.push({
        id: u.id,
        email: u.email ?? "(no email)",
        role: ((meta.invited_role as ProfileRole) ?? "agent"),
        invited_at: u.created_at,
      });
    }
  } catch (err) {
    console.error("[team] listing invites failed", err);
  }

  return { me: profile, orgId, members, pendingInvites };
}

/**
 * Fetches just the team members for a given org id, server-side. Used by the
 * Assign dropdown in the message thread (lighter than getTeamSnapshot).
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

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role, availability, created_at")
    .eq("org_id", me.org_id)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    email: (r.email as string | null) ?? null,
    full_name: (r.full_name as string | null) ?? null,
    avatar_url: (r.avatar_url as string | null) ?? null,
    role: r.role as ProfileRole,
    availability: (r.availability as Availability) ?? "offline",
    joined_at: r.created_at as string,
  }));
}
