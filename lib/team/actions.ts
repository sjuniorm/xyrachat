"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertCanInviteMember } from "@/lib/billing/gates";
import { AGENT_PERMISSION_DEFAULTS, type AgentPermissions } from "@/lib/team/permissions";
import type { ProfileRole } from "@/lib/db-types";

type ActionResult = { ok: true } | { ok: false; error: string };
type InviteResult =
  | { ok: true; mode: "added" | "invited" }
  | { ok: false; error: string };
type Admin = ReturnType<typeof createAdminClient>;

/** A user's role in a specific org, sourced from memberships (per-org). */
async function membershipRole(
  admin: Admin,
  userId: string,
  orgId: string,
): Promise<ProfileRole | null> {
  const { data } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as { role: ProfileRole } | null)?.role ?? null;
}

async function ownerCount(admin: Admin, orgId: string): Promise<number> {
  const { count } = await admin
    .from("memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "owner")
    .is("deleted_at", null);
  return count ?? 0;
}

/**
 * Invite a teammate by email into the caller's ACTIVE org.
 *  - If the email has no account yet → Supabase auth invite (handle_new_user
 *    links the new profile + a membership is created by the ensure_membership
 *    trigger).
 *  - If the email already belongs to an account → add (or revive) a membership
 *    directly, so a person can belong to multiple workspaces. They'll see the
 *    workspace appear in their switcher.
 *
 * Owners and admins can invite. Agents can't.
 */
export async function inviteTeamMember(
  formData: FormData,
): Promise<InviteResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "agent") as ProfileRole;

  if (!email || !/.+@.+\..+/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!["owner", "admin", "supervisor", "agent"].includes(role)) {
    return { ok: false, error: "Invalid role." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "You're not in an org." };
  if (me.role !== "owner" && me.role !== "admin") {
    return { ok: false, error: "Only owners and admins can invite." };
  }
  if (role === "owner" && me.role !== "owner") {
    return { ok: false, error: "Only owners can invite other owners." };
  }
  if (role === "admin" && me.role !== "owner") {
    return { ok: false, error: "Only owners can invite admins." };
  }

  // Plan gate — team-member count cap. Fails open for un-provisioned orgs.
  const seatGate = await assertCanInviteMember(me.org_id);
  if (!seatGate.ok) return { ok: false, error: seatGate.error };

  const admin = createAdminClient();

  // Existing account? Add/revive a membership instead of emailing a new invite.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if ((existing as { id: string } | null)?.id) {
    const existingId = (existing as { id: string }).id;
    const { data: mem } = await admin
      .from("memberships")
      .select("id, deleted_at")
      .eq("user_id", existingId)
      .eq("org_id", me.org_id)
      .maybeSingle();
    const memRow = mem as { id: string; deleted_at: string | null } | null;

    if (memRow && !memRow.deleted_at) {
      return { ok: false, error: "They're already a member of this workspace." };
    }
    if (memRow) {
      const { error } = await admin
        .from("memberships")
        .update({ deleted_at: null, role })
        .eq("id", memRow.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await admin
        .from("memberships")
        .insert({ user_id: existingId, org_id: me.org_id, role });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/settings/team");
    return { ok: true, mode: "added" };
  }

  // New user → email invite.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "xyra-chat.vercel.app";
  // Land invitees on /accept-invite so they set a password before reaching
  // the dashboard.
  const redirectTo = `${proto}://${host}/accept-invite`;

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      invited_org_id: me.org_id,
      invited_role: role,
      invited_by: user.id,
    },
  });
  if (inviteErr) return { ok: false, error: inviteErr.message };

  revalidatePath("/settings/team");
  return { ok: true, mode: "invited" };
}

/**
 * Remove a teammate from the caller's ACTIVE org. Revokes their membership in
 * this org (so they can't switch back in). Their account + any OTHER workspace
 * memberships are untouched. Only clears their active org if it was this one.
 *
 * Only owners + admins can remove; admins can't remove other admins; owners
 * can't remove the last owner.
 */
export async function removeTeamMember(
  formData: FormData,
): Promise<ActionResult> {
  const targetId = String(formData.get("user_id") ?? "");
  if (!targetId) return { ok: false, error: "Missing user id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (user.id === targetId) {
    return { ok: false, error: "You can't remove yourself." };
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "You're not in an org." };

  const admin = createAdminClient();
  const targetRole = await membershipRole(admin, targetId, me.org_id);
  if (!targetRole) return { ok: false, error: "User not in your org." };

  if (me.role === "agent" || me.role === "supervisor") {
    return { ok: false, error: "Only owners and admins can remove members." };
  }
  if (targetRole === "owner") {
    if (me.role !== "owner") {
      return { ok: false, error: "Only owners can remove other owners." };
    }
    if ((await ownerCount(admin, me.org_id)) <= 1) {
      return {
        ok: false,
        error: "Can't remove the last owner. Promote someone first.",
      };
    }
  }
  if (me.role === "admin" && targetRole === "admin") {
    return { ok: false, error: "Admins can't remove other admins." };
  }

  // Revoke their membership in THIS org.
  await admin
    .from("memberships")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", targetId)
    .eq("org_id", me.org_id);

  // Only touch their ACTIVE org if it was this one — move it to a remaining
  // workspace, else clear it. (If they were active elsewhere, leave it alone.)
  const { data: tp } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", targetId)
    .maybeSingle();
  if ((tp as { org_id: string | null } | null)?.org_id === me.org_id) {
    const { data: remaining } = await admin
      .from("memberships")
      .select("org_id, role")
      .eq("user_id", targetId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const fallback = remaining as { org_id: string; role: string } | null;
    const { error: updErr } = await admin
      .from("profiles")
      .update({
        org_id: fallback?.org_id ?? null,
        role: fallback?.role ?? "agent",
      })
      .eq("id", targetId);
    if (updErr) return { ok: false, error: updErr.message };
  }

  // Unassign anything they were on IN THIS ORG so it doesn't dangle.
  await admin
    .from("conversations")
    .update({ assigned_to: null })
    .eq("assigned_to", targetId)
    .eq("org_id", me.org_id);

  revalidatePath("/settings/team");
  return { ok: true };
}

/**
 * Cancel a pending invite (user hasn't accepted yet). Deletes the auth.users
 * row entirely so the invite link stops working.
 */
export async function cancelInvite(
  formData: FormData,
): Promise<ActionResult> {
  const targetId = String(formData.get("user_id") ?? "");
  if (!targetId) return { ok: false, error: "Missing user id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "You're not in an org." };
  if (me.role === "agent") {
    return { ok: false, error: "Agents can't cancel invites." };
  }

  const admin = createAdminClient();
  // Confirm this invite was for our org before hard-deleting.
  const { data: u, error: getErr } =
    await admin.auth.admin.getUserById(targetId);
  if (getErr || !u?.user) return { ok: false, error: "Invite not found." };
  const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;
  if (meta.invited_org_id !== me.org_id) {
    return { ok: false, error: "Not your org's invite." };
  }
  if (u.user.email_confirmed_at) {
    return { ok: false, error: "Invite already accepted — use Remove instead." };
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/settings/team");
  return { ok: true };
}

/**
 * Promote/demote a team member's role IN THE CALLER'S ACTIVE ORG (roles are
 * per-org). Updates the membership; also syncs profiles.role when the target's
 * active org is this one. Only owners can mint owners/admins; admins are
 * limited to supervisor↔agent and can't touch other admins.
 */
export async function changeMemberRole(
  formData: FormData,
): Promise<ActionResult> {
  const targetId = String(formData.get("user_id") ?? "");
  const newRole = String(formData.get("role") ?? "") as ProfileRole;

  if (!targetId) return { ok: false, error: "Missing user id." };
  if (!["owner", "admin", "supervisor", "agent"].includes(newRole)) {
    return { ok: false, error: "Invalid role." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (user.id === targetId) {
    return { ok: false, error: "You can't change your own role." };
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "You're not in an org." };

  const admin = createAdminClient();
  const targetRole = await membershipRole(admin, targetId, me.org_id);
  if (!targetRole) return { ok: false, error: "User not in your org." };

  if (me.role !== "owner" && me.role !== "admin") {
    return { ok: false, error: "Only owners and admins can change roles." };
  }
  if ((newRole === "owner" || newRole === "admin") && me.role !== "owner") {
    return { ok: false, error: "Only owners can promote to admin or owner." };
  }
  if (targetRole === "owner" && newRole !== "owner") {
    if (me.role !== "owner") {
      return { ok: false, error: "Only owners can demote other owners." };
    }
    if ((await ownerCount(admin, me.org_id)) <= 1) {
      return {
        ok: false,
        error: "Can't demote the last owner. Promote someone else first.",
      };
    }
  }
  if (me.role === "admin" && targetRole === "admin") {
    return { ok: false, error: "Admins can't change other admins' roles." };
  }

  const { error } = await admin
    .from("memberships")
    .update({ role: newRole })
    .eq("user_id", targetId)
    .eq("org_id", me.org_id);
  if (error) return { ok: false, error: error.message };

  // Sync the profile role if this org is the target's active workspace.
  const { data: tp } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", targetId)
    .maybeSingle();
  if ((tp as { org_id: string | null } | null)?.org_id === me.org_id) {
    await admin.from("profiles").update({ role: newRole }).eq("id", targetId);
  }

  revalidatePath("/settings/team");
  return { ok: true };
}

/**
 * Toggle the current user's availability (online / away / offline). Used by
 * the sidebar status dot.
 */
export async function setAvailability(
  formData: FormData,
): Promise<ActionResult> {
  const value = String(formData.get("availability") ?? "");
  if (value !== "online" && value !== "away" && value !== "offline") {
    return { ok: false, error: "Invalid availability." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ availability: value })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

// Update the org's agent-permission toggles (owner/admin only). Writes the full
// bag so unspecified keys fall back to defaults.
export async function updateAgentPermissions(
  perms: Partial<AgentPermissions>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "Not in an org." };
  if (me.role !== "owner" && me.role !== "admin") {
    return { ok: false, error: "Only owners and admins can change agent permissions." };
  }

  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const value: AgentPermissions = {
    restrict_to_assigned: bool(perms.restrict_to_assigned, AGENT_PERMISSION_DEFAULTS.restrict_to_assigned),
    can_delete_conversations: bool(perms.can_delete_conversations, AGENT_PERMISSION_DEFAULTS.can_delete_conversations),
    can_export: bool(perms.can_export, AGENT_PERMISSION_DEFAULTS.can_export),
    can_edit_contacts: bool(perms.can_edit_contacts, AGENT_PERMISSION_DEFAULTS.can_edit_contacts),
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ agent_permissions: value })
    .eq("id", me.org_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/team");
  revalidatePath("/inbox");
  return { ok: true };
}
