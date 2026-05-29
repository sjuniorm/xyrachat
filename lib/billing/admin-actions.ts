"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionBundle } from "./provision";
import { BUNDLES, type BundleId } from "./bundles";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// =====================================================================
// Operator-only entitlement admin. "Operator" = an owner of the Xyra
// Chat operating org. Identified by XYRA_OPERATOR_ORG_ID env var; if
// unset (dev / pre-launch with a single org), ANY owner qualifies so
// the founder can self-serve. Once there are customer orgs, set the
// env var to lock this down to the Xyra team's org.
// =====================================================================
async function requireOperator(): Promise<
  { ok: true; userId: string; orgId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return { ok: false, error: "Not in an org." };
  if (profile.role !== "owner") {
    return { ok: false, error: "Operator access is owner-only." };
  }
  const operatorOrg = process.env.XYRA_OPERATOR_ORG_ID;
  if (operatorOrg && profile.org_id !== operatorOrg) {
    return { ok: false, error: "Not the Xyra operator org." };
  }
  return { ok: true, userId: user.id, orgId: profile.org_id };
}

// Provision (or re-provision) an org with a bundle's entitlements.
// This is THE backfill tool — point it at your own org + pick a bundle.
export async function provisionOrgBundle(
  targetOrgId: string,
  bundleId: BundleId,
): Promise<ActionResult<{ provisioned: number }>> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  if (!BUNDLES[bundleId]) return { ok: false, error: `Unknown bundle: ${bundleId}` };

  // Verify the target org exists.
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("id", targetOrgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "Target org not found." };

  const res = await provisionBundle({
    orgId: targetOrgId,
    bundleId,
    stripeSubscriptionId: null,
    expiresAt: null,
  });
  if (!res.ok) return { ok: false, error: res.error };

  // Keep subscriptions.plan label + monthly token limit in sync so the
  // UI + AI gate match the provisioned bundle.
  const bundle = BUNDLES[bundleId];
  await admin
    .from("subscriptions")
    .update({
      plan: bundleId,
      monthly_ai_tokens_limit: parseInt(
        (bundle.entitlements["ai_tokens:monthly"] as string | undefined) ?? "50000",
        10,
      ),
    })
    .eq("org_id", targetOrgId);

  revalidatePath("/settings/admin/entitlements");
  return { ok: true, data: { provisioned: res.provisioned } };
}

// Provision EVERY org that currently has no entitlement rows. The
// one-click launch backfill. Defaults un-provisioned orgs to Trial so
// nobody is silently upgraded; the operator can bump individuals after.
export async function backfillUnprovisionedOrgs(
  bundleId: BundleId = "trial",
): Promise<ActionResult<{ count: number }>> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };

  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id");
  if (!orgs) return { ok: true, data: { count: 0 } };

  let count = 0;
  for (const org of orgs) {
    const { count: entCount } = await admin
      .from("org_entitlements")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id);
    if ((entCount ?? 0) > 0) continue; // already provisioned — skip
    const res = await provisionBundle({
      orgId: org.id,
      bundleId,
      stripeSubscriptionId: null,
      expiresAt: null,
    });
    if (res.ok) count += 1;
  }
  revalidatePath("/settings/admin/entitlements");
  return { ok: true, data: { count } };
}

// Manually grant or update a single entitlement row (custom deals,
// per-org overrides). source defaults to manual:<userId>.
export async function grantEntitlement(input: {
  targetOrgId: string;
  featureKey: string;
  value: string;
  expiresAt?: string | null;
  notes?: string;
}): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  if (!input.featureKey.trim() || !input.value.trim()) {
    return { ok: false, error: "feature_key and value are required." };
  }
  const source = `manual:${op.userId}`;
  const admin = createAdminClient();
  const { error } = await admin
    .from("org_entitlements")
    .upsert(
      {
        org_id: input.targetOrgId,
        feature_key: input.featureKey.trim(),
        value: input.value.trim(),
        source,
        expires_at: input.expiresAt ?? null,
        notes: input.notes ?? null,
        created_by: op.userId,
      },
      { onConflict: "org_id,source,feature_key" },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/admin/entitlements");
  return { ok: true };
}

// Revoke a single entitlement row by id.
export async function revokeEntitlement(rowId: string): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { error } = await admin.from("org_entitlements").delete().eq("id", rowId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/admin/entitlements");
  return { ok: true };
}
