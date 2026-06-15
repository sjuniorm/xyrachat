// =====================================================================
// Add-ons — paid extras that layer ON TOP of a base pack.
//
// Only packs with `addonsAllowed: true` (Edge, Prime) can buy these. Solo /
// Core / Trial cannot; Infinite already includes everything.
//
// MODEL (source of truth) is defined here. The PURCHASE FLOW is a follow-up
// (see the note at the bottom): add-ons become extra Stripe subscription items
// and write org_entitlements rows with source `addon:<id>`. Two kinds:
//   - 'quantity' : buy N; the granted number ADDS to the base (e.g. +1 user
//                  each). Needs additive provisioning (base + Σ add-on qty),
//                  which is the one piece the current "most-permissive-wins"
//                  entitlement model must be extended for.
//   - 'feature'  : flips a capability on (e.g. unlock integrations on Edge).
//
// ⚠️ Prices marked `// PRICE TBD` were not finalized — confirm before go-live.
// =====================================================================

import type { FeatureKey } from "./entitlements";
import type { BundleId } from "./bundles";

export type AddonId =
  | "extra_users"
  | "extra_channels"
  | "extra_chatbots"
  | "extra_ai_tokens"
  | "integrations"
  | "broadcasts"
  | "voice_pbx";

export type Addon = {
  id: AddonId;
  name: string;
  // EUR per month per unit (quantity add-ons) or per month (feature add-ons).
  // null = not priced yet (e.g. voice_pbx is a future product).
  monthlyPriceEur: number | null;
  kind: "quantity" | "feature";
  description: string;
  // Which base packs may purchase this add-on.
  allowedBundles: BundleId[];
  // The entitlement(s) this add-on affects. For 'quantity', `perUnit` is the
  // increment added to the base limit per unit bought. For 'feature', `flags`
  // lists the keys it sets to "true".
  perUnit?: { key: FeatureKey; amount: number };
  flags?: FeatureKey[];
  // Stripe Price ID is resolved dynamically from env at purchase time:
  // STRIPE_PRICE_ADDON_<ID>_MONTHLY.
  available: boolean; // false = announced but not yet purchasable (voice_pbx)
};

const EDGE_PRIME: BundleId[] = ["edge", "prime"];

export const ADDONS: Record<AddonId, Addon> = {
  extra_users: {
    id: "extra_users",
    name: "Extra user",
    monthlyPriceEur: 10,
    kind: "quantity",
    description: "Add a team seat. €10/mo each.",
    allowedBundles: EDGE_PRIME,
    perUnit: { key: "team_members:max", amount: 1 },
    available: true,
  },
  extra_channels: {
    id: "extra_channels",
    name: "Extra channel",
    monthlyPriceEur: 10, // PRICE TBD
    kind: "quantity",
    description: "Connect another channel beyond your plan's limit.",
    allowedBundles: EDGE_PRIME,
    perUnit: { key: "channels:max", amount: 1 },
    available: true,
  },
  extra_chatbots: {
    id: "extra_chatbots",
    name: "Extra chatbot",
    monthlyPriceEur: 15, // PRICE TBD
    kind: "quantity",
    description: "Train and run another AI chatbot.",
    allowedBundles: EDGE_PRIME,
    perUnit: { key: "bots:max", amount: 1 },
    available: true,
  },
  extra_ai_tokens: {
    id: "extra_ai_tokens",
    name: "Extra AI tokens",
    monthlyPriceEur: 15, // PRICE TBD
    kind: "quantity",
    description: "+500,000 AI tokens / month.",
    allowedBundles: EDGE_PRIME,
    perUnit: { key: "ai_tokens:monthly", amount: 500000 },
    available: true,
  },
  integrations: {
    id: "integrations",
    name: "Integrations (Make / Zapier / n8n)",
    monthlyPriceEur: 29, // PRICE TBD
    kind: "feature",
    description: "Unlock the Make, Zapier and n8n connectors.",
    allowedBundles: ["edge"], // Prime already includes integrations
    flags: ["integration:make", "integration:zapier", "integration:n8n"],
    available: true,
  },
  broadcasts: {
    id: "broadcasts",
    name: "Broadcasts",
    monthlyPriceEur: 20, // PRICE TBD
    kind: "feature",
    description: "Unlock WhatsApp broadcast campaigns.",
    allowedBundles: ["edge"], // Prime already includes broadcasts
    flags: ["feature:broadcasts"],
    available: true,
  },
  voice_pbx: {
    id: "voice_pbx",
    name: "Voice / PBX",
    monthlyPriceEur: null, // future product — not yet purchasable
    kind: "feature",
    description: "Voice calling / PBX. Coming later.",
    allowedBundles: EDGE_PRIME,
    flags: ["bots:voice_transcription"],
    available: false,
  },
};

// Add-ons a given pack can purchase (excludes unavailable/future ones for the
// buy UI; include them with available:false for the "coming soon" row).
export function addonsForBundle(bundleId: BundleId): Addon[] {
  return Object.values(ADDONS).filter((a) => a.allowedBundles.includes(bundleId));
}

// -----------------------------------------------------------------------------
// FOLLOW-UP (not built yet): the add-on PURCHASE flow.
//   1. Stripe: one Price per add-on (STRIPE_PRICE_ADDON_<ID>_MONTHLY); buying
//      adds a subscription ITEM (with quantity for 'quantity' add-ons).
//   2. Webhook: on subscription.updated, read the add-on items and write
//      org_entitlements rows source=`addon:<id>` — for 'quantity' the value is
//      base + (qty × perUnit.amount); for 'feature' set the flags true.
//   3. entitlements.ts: extend resolution so 'quantity' add-ons ADD to the base
//      bundle value instead of "most-permissive-wins" (which only takes the max).
//   4. UI: an add-on shelf on /settings/billing for Edge/Prime.
// -----------------------------------------------------------------------------
