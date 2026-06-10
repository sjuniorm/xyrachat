"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Client-granted support access — the CONSENT layer.
//
// A workspace owner/admin grants Xyra Support time-boxed, revocable consent to
// enter their workspace and help. This module records + reads that consent and
// audits every transition. It does NOT itself perform any cross-tenant read;
// operator-side assist code must call hasActiveSupportGrant(orgId) before
// acting on a client's behalf, so consent is always the gate.
// =====================================================================

export type SupportScope = "read_only" | "read_reply";

export type ActiveGrant = {
  scope: SupportScope;
  expires_at: string;
  granted_by: string | null;
  created_at: string;
};

type Result = { ok: true } | { ok: false; error: string };

const PRESET_DAYS: Record<string, number> = { "1": 1, "7": 7, "30": 30 };

async function requireManager(): Promise<
  | { ok: true; orgId: string; userId: string }
  | { ok: false; error: string }
> {
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
  // Only owners + admins control who can enter the workspace.
  if (me.role !== "owner" && me.role !== "admin") {
    return { ok: false, error: "Only owners and admins can manage support access." };
  }
  return { ok: true, orgId: me.org_id, userId: user.id };
}

// The org's live grant, or null. A row that's revoked OR past expiry is not live.
export async function getActiveSupportGrant(
  orgId: string,
): Promise<ActiveGrant | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_grants")
    .select("scope, expires_at, granted_by, created_at")
    .eq("org_id", orgId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActiveGrant | null) ?? null;
}

// Operator-side gate: is there live consent to assist this org right now?
export async function hasActiveSupportGrant(orgId: string): Promise<boolean> {
  return (await getActiveSupportGrant(orgId)) !== null;
}

// Grant (or re-grant) support access. Revokes any prior live grant first so the
// unique-active index holds and the expiry/scope always reflect the latest choice.
export async function grantSupportAccess(
  durationKey: string,
  scope: SupportScope,
): Promise<Result> {
  const auth = await requireManager();
  if (!auth.ok) return auth;
  const days = PRESET_DAYS[durationKey];
  if (!days) return { ok: false, error: "Pick a valid duration." };
  if (scope !== "read_only" && scope !== "read_reply") {
    return { ok: false, error: "Invalid scope." };
  }

  const admin = createAdminClient();
  const now = new Date();
  const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Clear any existing non-revoked row so the partial unique index is free.
  await admin
    .from("support_grants")
    .update({ revoked_at: now.toISOString() })
    .eq("org_id", auth.orgId)
    .is("revoked_at", null);

  const { error } = await admin.from("support_grants").insert({
    org_id: auth.orgId,
    granted_by: auth.userId,
    scope,
    expires_at: expires.toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  await admin.from("support_access_log").insert({
    org_id: auth.orgId,
    actor: auth.userId,
    action: "granted",
    detail: { scope, days, expires_at: expires.toISOString() },
  });

  revalidatePath("/settings/team");
  return { ok: true };
}

// Revoke immediately. Idempotent — revoking when nothing's live is a no-op.
export async function revokeSupportAccess(): Promise<Result> {
  const auth = await requireManager();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: cleared } = await admin
    .from("support_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", auth.orgId)
    .is("revoked_at", null)
    .select("id");

  if ((cleared ?? []).length > 0) {
    await admin.from("support_access_log").insert({
      org_id: auth.orgId,
      actor: auth.userId,
      action: "revoked",
      detail: {},
    });
  }

  revalidatePath("/settings/team");
  return { ok: true };
}
