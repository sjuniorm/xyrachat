import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUNDLES, type BundleId } from "./bundles";
import { ADDONS, type AddonId } from "./addons";

// =====================================================================
// Add-on entitlement provisioning.
//
// Recomputes ALL `addon:*` rows in org_entitlements from the org's active
// org_addons + its CURRENT base pack. Idempotent: clears then re-writes, so it's
// safe to call after any purchase/removal AND on every subscription.updated
// (base changes recompute deltas against the new base).
//
// Quantity add-ons write value = baseValue + qty×perUnit so the existing
// "most-permissive-wins" resolver in entitlements.ts picks them up unchanged
// (the add-on row is strictly larger than the base bundle row). Feature add-ons
// write the flag = "true". Add-ons not allowed on the current base pack are
// skipped (e.g. after a downgrade) — the operator/flow should also drop the
// Stripe item, but the entitlement never over-grants regardless.
// =====================================================================

type ActiveAddon = { addon_id: string; quantity: number };

export async function recomputeAddonEntitlements(orgId: string): Promise<void> {
  const admin = createAdminClient();

  // Current base pack (subscriptions.plan is the base bundle id).
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan, stripe_subscription_id")
    .eq("org_id", orgId)
    .maybeSingle();
  const baseBundleId = (sub?.plan ?? null) as BundleId | null;
  const base = baseBundleId ? BUNDLES[baseBundleId] : null;

  const { data: rows } = await admin
    .from("org_addons")
    .select("addon_id, quantity")
    .eq("org_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null);
  const active = (rows as ActiveAddon[] | null) ?? [];

  // Clean slate — drop every addon-sourced entitlement for this org, then
  // re-derive. (DELETE-then-INSERT keeps removals correct without diffing.)
  await admin.from("org_entitlements").delete().eq("org_id", orgId).like("source", "addon:%");

  if (!base) return; // no base pack → nothing to layer onto

  const inserts: Array<{ org_id: string; feature_key: string; value: string; source: string }> = [];

  for (const a of active) {
    const addon = ADDONS[a.addon_id as AddonId];
    if (!addon || !addon.available) continue;
    // Only grant if the current base pack is allowed to have this add-on.
    if (!addon.allowedBundles.includes(base.id)) continue;
    const source = `addon:${addon.id}`;

    if (addon.kind === "quantity" && addon.perUnit) {
      const baseRaw = base.entitlements[addon.perUnit.key];
      const baseVal = baseRaw === undefined ? 0 : parseInt(baseRaw, 10);
      // Unlimited base (-1) means the limit is already Infinity — nothing to add.
      if (baseVal < 0) continue;
      const total = baseVal + Math.max(1, a.quantity) * addon.perUnit.amount;
      inserts.push({ org_id: orgId, feature_key: addon.perUnit.key, value: String(total), source });
    } else if (addon.kind === "feature" && addon.flags) {
      for (const key of addon.flags) {
        inserts.push({ org_id: orgId, feature_key: key, value: "true", source });
      }
    }
  }

  if (inserts.length > 0) {
    await admin.from("org_entitlements").insert(inserts);
  }
}
