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
  // increment added to the base limit per unit bought. For 'feature', `grants`
  // is the exact set of entitlement values it writes (flags AND any numeric
  // caps the feature implies — e.g. broadcasts must also raise broadcasts:monthly).
  perUnit?: { key: FeatureKey; amount: number };
  grants?: Partial<Record<FeatureKey, string>>;
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
    monthlyPriceEur: 15, // recommended default — confirm
    kind: "quantity",
    description: "Connect another channel beyond your plan's limit.",
    allowedBundles: EDGE_PRIME,
    perUnit: { key: "channels:max", amount: 1 },
    available: true,
  },
  extra_chatbots: {
    id: "extra_chatbots",
    name: "Extra chatbot",
    monthlyPriceEur: 25, // recommended default — confirm
    kind: "quantity",
    description: "Train and run another AI chatbot.",
    allowedBundles: EDGE_PRIME,
    perUnit: { key: "bots:max", amount: 1 },
    available: true,
  },
  extra_ai_tokens: {
    id: "extra_ai_tokens",
    name: "Extra AI tokens",
    monthlyPriceEur: 19, // recommended default — the only add-on with real COGS
    kind: "quantity",
    description: "+500,000 AI tokens / month.",
    allowedBundles: EDGE_PRIME,
    perUnit: { key: "ai_tokens:monthly", amount: 500000 },
    available: true,
  },
  integrations: {
    id: "integrations",
    name: "Integrations (Make / Zapier / n8n)",
    monthlyPriceEur: 29, // recommended default — confirm
    kind: "feature",
    description: "Unlock the Make, Zapier and n8n connectors.",
    allowedBundles: ["edge"], // Prime already includes integrations
    grants: {
      "integration:make": "true",
      "integration:zapier": "true",
      "integration:n8n": "true",
    },
    available: true,
  },
  broadcasts: {
    id: "broadcasts",
    name: "Broadcasts",
    monthlyPriceEur: 29, // recommended default — confirm
    kind: "feature",
    description: "Unlock WhatsApp broadcast campaigns.",
    allowedBundles: ["edge"], // Prime already includes broadcasts
    // Must raise the numeric caps too, not just the flag — otherwise
    // broadcasts:monthly stays 0 and every send is blocked. Mirror Prime.
    grants: {
      "feature:broadcasts": "true",
      "broadcasts:monthly": "5000",
      "broadcasts:wa_conversations_included": "5000",
    },
    available: true,
  },
  voice_pbx: {
    id: "voice_pbx",
    name: "Voice / PBX",
    monthlyPriceEur: null, // future product — not yet purchasable
    kind: "feature",
    description: "Voice calling / PBX. Coming later.",
    allowedBundles: EDGE_PRIME,
    grants: { "bots:voice_transcription": "true" },
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
