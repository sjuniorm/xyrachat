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
