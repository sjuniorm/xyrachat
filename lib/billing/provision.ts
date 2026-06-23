import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUNDLES, type BundleId } from "./bundles";

// =====================================================================
// Bundle provisioning — called from the Stripe webhook on
// checkout.session.completed / customer.subscription.updated. Atomically
// swaps out the old bundle's entitlements for the new bundle's via the
// provision_bundle_entitlements RPC defined in migration 026.
//
// Per-org overrides (source != 'bundle:*') survive — only the bundle's
// own rows get replaced. This lets a custom-quote add-on stay attached
// even if the customer downgrades their base bundle.
// =====================================================================

export async function provisionBundle(input: {
  orgId: string;
  bundleId: BundleId;
  stripeSubscriptionId: string | null;
  expiresAt: string | null; // ISO timestamp; null = no expiry
}): Promise<{ ok: true; provisioned: number } | { ok: false; error: string }> {
  const bundle = BUNDLES[input.bundleId];
  if (!bundle) return { ok: false, error: `Unknown bundle: ${input.bundleId}` };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("provision_bundle_entitlements", {
    p_org_id: input.orgId,
    p_bundle_source: bundle.entitlementSource,
    p_entitlements: bundle.entitlements,
    p_stripe_subscription_id: input.stripeSubscriptionId,
    p_expires_at: input.expiresAt,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, provisioned: (data as number) ?? 0 };
}

// Strip ALL entitlement rows owned by any bundle (source LIKE 'bundle:%').
// Used when a subscription is hard-canceled — per-org overrides stay
// intact so a customer with a Pro plan + a custom quote can keep the
// quote even if the Pro plan ends.
export async function clearAllBundleEntitlements(orgId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("org_entitlements")
    .delete()
    .eq("org_id", orgId)
    .like("source", "bundle:%");
}

// Strip bundle rows from OTHER bundle sources, keeping `keepSource`.
async function clearOtherBundleEntitlements(orgId: string, keepSource: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("org_entitlements")
    .delete()
    .eq("org_id", orgId)
    .like("source", "bundle:%")
    .neq("source", keepSource);
}

// Provision a bundle AS THE ONLY bundle source — the correct primitive for any
// plan CHANGE (Stripe checkout/upgrade/downgrade + the operator console).
//
// The provision RPC only swaps rows for the NEW bundle's own source, so on a
// plan change the PRIOR bundle's rows linger; most-permissive resolution then
// keeps the old plan's HIGHER numeric/boolean limits (channels:max, bots:max,
// api:*, …) — i.e. a downgrade wouldn't actually downgrade.
//
// Order matters: provision FIRST (atomic insert of the new source), and only
// clear the OTHER bundle sources once that succeeds — so the org is NEVER left
// with zero bundle rows. Worst case on a cleanup failure is a harmless lingering
// old row (over-served, fail-safe), never a row-less hard-lock. Add-ons +
// per-org overrides (non-`bundle:%` sources) always survive.
export async function provisionBundleExclusive(input: {
  orgId: string;
  bundleId: BundleId;
  stripeSubscriptionId: string | null;
  expiresAt: string | null;
}): Promise<{ ok: true; provisioned: number } | { ok: false; error: string }> {
  const res = await provisionBundle(input);
  if (!res.ok) return res; // prior rows intact — safe; caller can surface/retry
  await clearOtherBundleEntitlements(input.orgId, BUNDLES[input.bundleId].entitlementSource);
  return res;
}
