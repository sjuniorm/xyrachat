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
  if (role !== "admin" && role !== "agent") {
    return { ok: false, error: "Role must be admin or agent." };
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

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "xyra-chat.vercel.app";
  const redirectTo = `${proto}://${host}/dashboard`;

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
  if (target.role === "owner") {
    return { ok: false, error: "Owners can't be removed." };
  }
  if (me.role === "agent") {
    return { ok: false, error: "Agents can't remove members." };
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
