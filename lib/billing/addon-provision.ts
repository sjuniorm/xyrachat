import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUNDLES, type BundleId } from "./bundles";
import { ADDONS, type AddonId } from "./addons";

// =====================================================================
// Add-on entitlement provisioning.
//
// Recomputes ALL `addon:*` rows in org_entitlements from the org's active
// org_addons + its CURRENT base pack. Idempotent: clears then re-writes, so it's
// safe to call after any purchase/removal AND on every subscription.updated.
//
// Quantity add-ons write value = baseValue + qty×perUnit so the existing
// "most-permissive-wins" resolver in entitlements.ts picks them up unchanged.
// Feature add-ons write their `grants` map verbatim (flags AND any numeric caps
// the feature implies — e.g. broadcasts must also set broadcasts:monthly, or the
// count cap stays 0 and every send is blocked).
//
// CRITICAL: the AI-token limit is enforced by the consume_ai_tokens RPC against
// the subscriptions.monthly_ai_tokens_limit COLUMN, NOT the entitlement. So we
// must ALSO write the effective ai_tokens:monthly (base + extra_ai_tokens delta)
// into that column here, or the extra_ai_tokens add-on would bill for nothing.
// =====================================================================

type ActiveAddon = { addon_id: string; quantity: number };

export async function recomputeAddonEntitlements(orgId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan")
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

  // Clean slate — drop every addon-sourced entitlement, then re-derive.
  await admin.from("org_entitlements").delete().eq("org_id", orgId).like("source", "addon:%");

  if (!base) return; // no base pack → nothing to layer onto

  const inserts: Array<{ org_id: string; feature_key: string; value: string; source: string }> = [];
  // Effective AI-token budget — starts at the base pack's value, bumped by the
  // extra_ai_tokens add-on, then synced into the subscriptions column below.
  const baseAiRaw = base.entitlements["ai_tokens:monthly"];
  const baseAi = baseAiRaw === undefined ? null : parseInt(baseAiRaw, 10);
  let effectiveAi = baseAi;

  for (const a of active) {
    const addon = ADDONS[a.addon_id as AddonId];
    if (!addon || !addon.available) continue;
    if (!addon.allowedBundles.includes(base.id)) continue;
    const source = `addon:${addon.id}`;
    const qty = Math.max(1, a.quantity);

    if (addon.kind === "quantity" && addon.perUnit) {
      const baseRaw = base.entitlements[addon.perUnit.key];
      const baseVal = baseRaw === undefined ? 0 : parseInt(baseRaw, 10);
      if (baseVal < 0) continue; // base already unlimited
      const total = baseVal + qty * addon.perUnit.amount;
      inserts.push({ org_id: orgId, feature_key: addon.perUnit.key, value: String(total), source });
      if (addon.perUnit.key === "ai_tokens:monthly" && baseAi !== null && baseAi >= 0) {
        effectiveAi = baseAi + qty * addon.perUnit.amount;
      }
    } else if (addon.kind === "feature" && addon.grants) {
      for (const [key, value] of Object.entries(addon.grants)) {
        inserts.push({ org_id: orgId, feature_key: key, value, source });
      }
    }
  }

  if (inserts.length > 0) {
    await admin.from("org_entitlements").insert(inserts);
  }

  // Sync the AI-token column the quota RPC actually reads (base or base+addon).
  // Only when the base is a finite budget (Infinite/-1 stays untouched).
  if (effectiveAi !== null && effectiveAi >= 0) {
    await admin
      .from("subscriptions")
      .update({ monthly_ai_tokens_limit: effectiveAi })
      .eq("org_id", orgId);
  }
}

// Reverse map a Stripe price id → addon id, by checking each add-on's env price
// var. Used by the webhook to adopt orphaned add-on items (Stripe = source of
// truth). Server-only (reads server env). Returns null if no match.
export function addonIdFromPriceId(priceId: string): AddonId | null {
  for (const id of Object.keys(ADDONS) as AddonId[]) {
    const key = `STRIPE_PRICE_ADDON_${id.toUpperCase()}_MONTHLY`;
    const v = process.env[key];
    if (v && v === priceId) return id;
  }
  return null;
}
