"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "./stripe";
import { BUNDLES, type BundleId } from "./bundles";
import { ADDONS, type AddonId } from "./addons";
import { recomputeAddonEntitlements } from "./addon-provision";

// =====================================================================
// Add-on purchase / removal. An add-on is a Stripe subscription ITEM added to
// the org's existing base subscription; org_addons mirrors it locally and
// recomputeAddonEntitlements grants the matching entitlements.
//
// Owner-only. Env-gated: if Stripe isn't configured, or the add-on's Stripe
// price var is unset, it returns a friendly error and changes nothing — so this
// can't half-apply before the operator wires Stripe.
// ⚠️ The live Stripe subscription-item calls are UNTESTED against a real
// account — verify in Stripe test mode before relying on it in production.
// =====================================================================

type Result = { ok: true } | { ok: false; error: string };

function priceIdForAddon(addonId: AddonId): string | null {
  const key = `STRIPE_PRICE_ADDON_${addonId.toUpperCase()}_MONTHLY`;
  const v = process.env[key];
  return v && v.startsWith("price_") ? v : null;
}

async function requireOwnerOrg(): Promise<
  { ok: true; orgId: string } | { ok: false; error: string }
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
  if (me.role !== "owner") return { ok: false, error: "Only the workspace owner can change add-ons." };
  return { ok: true, orgId: me.org_id };
}

// Validate the add-on is real, available, and allowed on the org's CURRENT base
// pack. Returns the base bundle id + the org's stripe subscription id.
async function loadContext(
  orgId: string,
  addonId: AddonId,
): Promise<
  | { ok: true; baseBundleId: BundleId; stripeSubId: string }
  | { ok: false; error: string }
> {
  const addon = ADDONS[addonId];
  if (!addon || !addon.available) return { ok: false, error: "Unknown add-on." };

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan, stripe_subscription_id, status")
    .eq("org_id", orgId)
    .maybeSingle();
  const baseBundleId = (sub?.plan ?? null) as BundleId | null;
  if (!baseBundleId || !BUNDLES[baseBundleId]) {
    return { ok: false, error: "No active plan found." };
  }
  if (!BUNDLES[baseBundleId].addonsAllowed || !addon.allowedBundles.includes(baseBundleId)) {
    return { ok: false, error: `${addon.name} isn't available on your current plan.` };
  }
  if (!sub?.stripe_subscription_id) {
    return { ok: false, error: "Add-ons need an active paid subscription. Choose a plan first." };
  }
  return { ok: true, baseBundleId, stripeSubId: sub.stripe_subscription_id };
}

// Buy (or change the quantity of) an add-on. quantity applies to 'quantity'
// add-ons; 'feature' add-ons are always quantity 1.
export async function purchaseAddon(addonId: AddonId, quantity = 1): Promise<Result> {
  const auth = await requireOwnerOrg();
  if (!auth.ok) return auth;
  const ctx = await loadContext(auth.orgId, addonId);
  if (!ctx.ok) return ctx;

  const addon = ADDONS[addonId];
  const qty = addon.kind === "quantity" ? Math.max(1, Math.floor(quantity)) : 1;
  const priceId = priceIdForAddon(addonId);
  if (!priceId) {
    return { ok: false, error: `${addon.name} isn't configured for purchase yet. (Operator: set STRIPE_PRICE_ADDON_${addonId.toUpperCase()}_MONTHLY.)` };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("org_addons")
    .select("id, stripe_subscription_item_id")
    .eq("org_id", auth.orgId)
    .eq("addon_id", addonId)
    .is("deleted_at", null)
    .maybeSingle();

  // Manage the Stripe subscription item (create or update quantity).
  let stripeItemId: string | null = existing?.stripe_subscription_item_id ?? null;
  try {
    const stripe = getStripe();
    if (stripeItemId) {
      await stripe.subscriptionItems.update(stripeItemId, {
        quantity: qty,
        proration_behavior: "create_prorations",
      });
    } else {
      const item = await stripe.subscriptionItems.create({
        subscription: ctx.stripeSubId,
        price: priceId,
        quantity: qty,
        proration_behavior: "create_prorations",
      });
      stripeItemId = item.id;
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Stripe: ${err.message}` : "Stripe error." };
  }

  const now = new Date().toISOString();
  if (existing) {
    await admin
      .from("org_addons")
      .update({ quantity: qty, stripe_subscription_item_id: stripeItemId, status: "active", updated_at: now })
      .eq("id", existing.id);
  } else {
    await admin.from("org_addons").insert({
      org_id: auth.orgId,
      addon_id: addonId,
      quantity: qty,
      stripe_subscription_item_id: stripeItemId,
      status: "active",
    });
  }

  // The webhook will also recompute on subscription.updated, but do it now so
  // the entitlement is live immediately (no wait for the event round-trip).
  await recomputeAddonEntitlements(auth.orgId);
  revalidatePath("/settings/billing");
  return { ok: true };
}

// Remove an add-on entirely.
export async function removeAddon(addonId: AddonId): Promise<Result> {
  const auth = await requireOwnerOrg();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("org_addons")
    .select("id, stripe_subscription_item_id")
    .eq("org_id", auth.orgId)
    .eq("addon_id", addonId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return { ok: true }; // nothing to remove

  if (existing.stripe_subscription_item_id) {
    try {
      const stripe = getStripe();
      await stripe.subscriptionItems.del(existing.stripe_subscription_item_id, {
        proration_behavior: "create_prorations",
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? `Stripe: ${err.message}` : "Stripe error." };
    }
  }

  await admin
    .from("org_addons")
    .update({ status: "canceled", deleted_at: new Date().toISOString() })
    .eq("id", existing.id);

  await recomputeAddonEntitlements(auth.orgId);
  revalidatePath("/settings/billing");
  return { ok: true };
}
