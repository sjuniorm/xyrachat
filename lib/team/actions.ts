"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileRole } from "@/lib/db-types";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Invite a teammate by email. Sends a Supabase auth invite with our metadata
 * payload — handle_new_user() reads this on first sign-in and auto-links the
 * new profile to our org with the chosen role (see migration 007).
 *
 * Owners and admins can invite. Agents can't.
 */
export async function inviteTeamMember(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "agent") as ProfileRole;

  if (!email || !/.+@.+\..+/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  // Owners can be invited only by other owners — see role-check below.
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

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "xyra-chat.vercel.app";
  // Land invitees on /accept-invite so they set a password before reaching
  // the dashboard. Without this, they're stuck: Supabase logs them in via
  // magic link, they have no password, and "Forgot password" is the only
  // way back in once the session expires.
  const redirectTo = `${proto}://${host}/accept-invite`;

  const admin = createAdminClient();
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
  return { ok: true };
}

/**
 * Remove a teammate from the org. Soft-action: clears org_id + role on their
 * profile so they can't access the org anymore. Their auth account stays.
 *
 * Only owners can remove anyone; admins can remove agents; agents can't remove.
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
  const { data: target } = await admin
    .from("profiles")
    .select("org_id, role")
    .eq("id", targetId)
    .maybeSingle();
  if (!target || target.org_id !== me.org_id) {
    return { ok: false, error: "User not in your org." };
  }
  if (me.role === "agent" || me.role === "supervisor") {
    return { ok: false, error: "Only owners and admins can remove members." };
  }
  // Owners can remove other owners — but never the last one.
  if (target.role === "owner") {
    if (me.role !== "owner") {
      return { ok: false, error: "Only owners can remove other owners." };
    }
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", me.org_id)
      .eq("role", "owner")
      .is("deleted_at", null);
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Can't remove the last owner. Promote someone first.",
      };
    }
  }
  if (me.role === "admin" && target.role === "admin") {
    return { ok: false, error: "Admins can't remove other admins." };
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({ org_id: null, role: "agent" })
    .eq("id", targetId);
  if (updErr) return { ok: false, error: updErr.message };

  // Unassign anything they were on so it doesn't dangle.
  await admin
    .from("conversations")
    .update({ assigned_to: null })
    .eq("assigned_to", targetId);

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
 * Promote/demote a team member's role. Only owners can change anyone's role
 * (including promoting someone to owner — co-owner pattern). Admins are
 * limited to moving people between supervisor + agent.
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

  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "You're not in an org." };

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("org_id, role")
    .eq("id", targetId)
    .maybeSingle();
  if (!target || target.org_id !== me.org_id) {
    return { ok: false, error: "User not in your org." };
  }
  if (user.id === targetId) {
    return { ok: false, error: "You can't change your own role." };
  }
  if (me.role !== "owner" && me.role !== "admin") {
    return { ok: false, error: "Only owners and admins can change roles." };
  }
  // Only owners can mint other owners or admins.
  if ((newRole === "owner" || newRole === "admin") && me.role !== "owner") {
    return { ok: false, error: "Only owners can promote to admin or owner." };
  }
  // Demoting an owner is owner-only and requires there to be another owner.
  if (target.role === "owner" && newRole !== "owner") {
    if (me.role !== "owner") {
      return { ok: false, error: "Only owners can demote other owners." };
    }
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", me.org_id)
      .eq("role", "owner")
      .is("deleted_at", null);
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Can't demote the last owner. Promote someone else first.",
      };
    }
  }
  // Admins can't touch admins.
  if (me.role === "admin" && target.role === "admin") {
    return { ok: false, error: "Admins can't change other admins' roles." };
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetId);
  if (error) return { ok: false, error: error.message };

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
