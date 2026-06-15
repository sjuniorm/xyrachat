// =====================================================================
// Plan bundles — what entitlements each plan grants.
//
// FIVE paid packs a customer can buy via Stripe Checkout, plus the free Trial:
//   Solo €29 · Core €49 · Edge €99 · Prime €199 · Infinite €399
// Per-customer custom deals + ADD-ONS (see lib/billing/addons.ts) layer on top
// by inserting org_entitlements rows with a different `source`.
//
// Editing a bundle is a code deploy. The Stripe webhook reads from this file
// when provisioning entitlements on checkout / upgrade / downgrade.
//
// VALUE encoding (matches lib/billing/entitlements.ts):
//   number    → '1000'      (positive int)
//   unlimited → '-1'        (sentinel; becomes Infinity at read time)
//   boolean   → 'true'/'false'
//
// ⚠️ Values marked `// ASSUMED` were NOT specified in the pricing meeting —
// they're sensible defaults (mostly AI-token budgets + Infinite's contents +
// Core's "limited automations" cap). Change freely; they're just code.
// =====================================================================

import type { FeatureKey } from "./entitlements";

export type BundleId = "trial" | "solo" | "core" | "edge" | "prime" | "infinite";

export type Bundle = {
  id: BundleId;
  name: string;
  // Monthly EUR price for display + Stripe Price selection. null = free.
  monthlyPriceEur: number | null;
  // Stripe Price ID for checkout. Resolved dynamically from env
  // (STRIPE_PRICE_<ID>_<MONTHLY|YEARLY>) by lib/billing/stripe.ts, so these
  // are usually left undefined here.
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  // Trial length in days when signing up to this bundle. Paid bundles use 0
  // unless given a trial via promo / manual extension.
  trialDays: number;
  description: string;
  // Whether add-ons (lib/billing/addons.ts) can be purchased on this pack.
  addonsAllowed: boolean;
  // Source string written to org_entitlements when provisioned. Lets us undo
  // just this bundle on downgrade without touching per-org overrides / add-ons.
  entitlementSource: string;
  entitlements: Partial<Record<FeatureKey, string>>;
};

// All five channel-type flags ON (used by every pack except Solo, which is
// Instagram-only).
const ALL_CHANNELS = {
  "channels:whatsapp": "true",
  "channels:instagram": "true",
  "channels:telegram": "true",
  "channels:email": "true",
  "channels:facebook": "true",
} as const;

export const BUNDLES: Record<BundleId, Bundle> = {
  trial: {
    id: "trial",
    name: "Trial",
    monthlyPriceEur: null,
    trialDays: 14,
    description: "14-day free trial. Try one of everything.",
    addonsAllowed: false,
    entitlementSource: "bundle:trial",
    entitlements: {
      "channels:max": "1",
      ...ALL_CHANNELS,
      "team_members:max": "1",
      "bots:max": "1",
      "bots:knowledge_sources_max": "5",
      "bots:voice_transcription": "false",
      "ai_tokens:monthly": "50000",
      "feature:broadcasts": "false",
      "broadcasts:monthly": "0",
      "broadcasts:wa_conversations_included": "0",
      "feature:automations": "true",
      "automations:max": "3",
      "api:read": "false",
      "api:write": "false",
      "api:requests_per_min": "0",
      "api:webhook_deliveries_monthly": "0",
      "integration:make": "false",
      "integration:zapier": "false",
      "integration:n8n": "false",
      "feature:whitelabel": "false",
      "feature:priority_support": "false",
      "feature:custom_integrations": "false",
    },
  },

  // Solo — Instagram ONLY (auto-DMs, comment replies). No other channels, no
  // AI chatbot, no add-ons. The cheap ManyChat-style IG-automation wedge.
  solo: {
    id: "solo",
    name: "Solo",
    monthlyPriceEur: 29,
    trialDays: 0,
    description: "€29/mo. Instagram only — auto-DMs, comment & DM keyword replies.",
    addonsAllowed: false,
    entitlementSource: "bundle:solo",
    entitlements: {
      "channels:max": "1",
      "channels:instagram": "true",
      "channels:whatsapp": "false",
      "channels:telegram": "false",
      "channels:email": "false",
      "channels:facebook": "false",
      "team_members:max": "1",
      "bots:max": "0", // ASSUMED: automations only, no AI chatbot at this tier
      "bots:knowledge_sources_max": "0",
      "bots:voice_transcription": "false",
      "ai_tokens:monthly": "50000", // ASSUMED
      "feature:broadcasts": "false",
      "broadcasts:monthly": "0",
      "broadcasts:wa_conversations_included": "0",
      "feature:automations": "true",
      "automations:max": "5", // ASSUMED ("limited")
      "api:read": "false",
      "api:write": "false",
      "api:requests_per_min": "0",
      "api:webhook_deliveries_monthly": "0",
      "integration:make": "false",
      "integration:zapier": "false",
      "integration:n8n": "false",
      "feature:whitelabel": "false",
      "feature:priority_support": "false",
      "feature:custom_integrations": "false",
    },
  },

  // Core — 1 channel (any), 1 user, 1 chatbot, limited automations. No API,
  // no integrations, no broadcasts, no add-ons.
  core: {
    id: "core",
    name: "Core",
    monthlyPriceEur: 49,
    trialDays: 0,
    description: "€49/mo. 1 channel, 1 user, 1 chatbot, automations.",
    addonsAllowed: false,
    entitlementSource: "bundle:core",
    entitlements: {
      "channels:max": "1",
      ...ALL_CHANNELS,
      "team_members:max": "1",
      "bots:max": "1",
      "bots:knowledge_sources_max": "20", // ASSUMED
      "bots:voice_transcription": "false",
      "ai_tokens:monthly": "300000", // ASSUMED
      "feature:broadcasts": "false",
      "broadcasts:monthly": "0",
      "broadcasts:wa_conversations_included": "0",
      "feature:automations": "true",
      "automations:max": "3", // ASSUMED ("automations yes but limited")
      "api:read": "false",
      "api:write": "false",
      "api:requests_per_min": "0",
      "api:webhook_deliveries_monthly": "0",
      "integration:make": "false",
      "integration:zapier": "false",
      "integration:n8n": "false",
      "feature:whitelabel": "false",
      "feature:priority_support": "false",
      "feature:custom_integrations": "false",
    },
  },

  // Edge — 6 channels, 5 users, 3 chatbots, full API, unlimited automations.
  // No integrations / broadcasts in the base (both available as ADD-ONS).
  edge: {
    id: "edge",
    name: "Edge",
    monthlyPriceEur: 99,
    trialDays: 0,
    description: "€99/mo. 6 channels, 5 users, 3 chatbots, API, automations.",
    addonsAllowed: true,
    entitlementSource: "bundle:edge",
    entitlements: {
      "channels:max": "6",
      ...ALL_CHANNELS,
      "team_members:max": "5",
      "bots:max": "3",
      "bots:knowledge_sources_max": "50", // ASSUMED
      "bots:voice_transcription": "false",
      "ai_tokens:monthly": "1000000", // ASSUMED
      "feature:broadcasts": "false",
      "broadcasts:monthly": "0",
      "broadcasts:wa_conversations_included": "0",
      "feature:automations": "true",
      "automations:max": "-1",
      "api:read": "true",
      "api:write": "true", // ASSUMED "api yes" = full read+write
      "api:requests_per_min": "300",
      "api:webhook_deliveries_monthly": "50000",
      "integration:make": "false", // available via the "integrations" add-on
      "integration:zapier": "false",
      "integration:n8n": "false",
      "feature:whitelabel": "false",
      "feature:priority_support": "false",
      "feature:custom_integrations": "false",
    },
  },

  // Prime — 10 channels, 10 users, 3 chatbots, full API, integrations,
  // broadcasts, add-ons.
  prime: {
    id: "prime",
    name: "Prime",
    monthlyPriceEur: 199,
    trialDays: 0,
    description: "€199/mo. 10 channels, 10 users, 3 chatbots, integrations, broadcasts, API.",
    addonsAllowed: true,
    entitlementSource: "bundle:prime",
    entitlements: {
      "channels:max": "10",
      ...ALL_CHANNELS,
      "team_members:max": "10",
      "bots:max": "3",
      "bots:knowledge_sources_max": "-1", // ASSUMED
      "bots:voice_transcription": "false",
      "ai_tokens:monthly": "2500000", // ASSUMED
      "feature:broadcasts": "true",
      "broadcasts:monthly": "5000", // ASSUMED
      "broadcasts:wa_conversations_included": "5000", // ASSUMED
      "feature:automations": "true",
      "automations:max": "-1",
      "api:read": "true",
      "api:write": "true",
      "api:requests_per_min": "600",
      "api:webhook_deliveries_monthly": "100000",
      "integration:make": "true",
      "integration:zapier": "true",
      "integration:n8n": "true",
      "feature:whitelabel": "false",
      "feature:priority_support": "true", // ASSUMED
      "feature:custom_integrations": "false",
    },
  },

  // Infinite — €399. Contents not finalized; proposed as "unlimited everything
  // + white-label + priority support + voice". CONFIRM/ADJUST.
  infinite: {
    id: "infinite",
    name: "Infinite",
    monthlyPriceEur: 399,
    trialDays: 0,
    description: "€399/mo. Unlimited everything, white-label, priority support.",
    addonsAllowed: false, // everything's already included
    entitlementSource: "bundle:infinite",
    entitlements: {
      "channels:max": "-1",
      ...ALL_CHANNELS,
      "team_members:max": "-1",
      "bots:max": "-1",
      "bots:knowledge_sources_max": "-1",
      "bots:voice_transcription": "true",
      "ai_tokens:monthly": "10000000", // ASSUMED
      "feature:broadcasts": "true",
      "broadcasts:monthly": "-1",
      "broadcasts:wa_conversations_included": "25000", // ASSUMED
      "feature:automations": "true",
      "automations:max": "-1",
      "api:read": "true",
      "api:write": "true",
      "api:requests_per_min": "3000",
      "api:webhook_deliveries_monthly": "1000000",
      "integration:make": "true",
      "integration:zapier": "true",
      "integration:n8n": "true",
      "feature:whitelabel": "true",
      "feature:priority_support": "true",
      "feature:custom_integrations": "true",
    },
  },
};

// Map a Stripe Price ID back to a bundle. Used by the webhook handler on
// checkout.session.completed.
export function bundleFromStripePriceId(priceId: string): Bundle | null {
  for (const bundle of Object.values(BUNDLES)) {
    if (bundle.stripePriceIdMonthly === priceId) return bundle;
    if (bundle.stripePriceIdYearly === priceId) return bundle;
  }
  return null;
}

// Convenience accessor.
export function getBundle(id: BundleId): Bundle {
  return BUNDLES[id];
}

// Paid packs in display order (excludes the free Trial). Drives the billing UI.
export const PAID_BUNDLE_IDS: BundleId[] = ["solo", "core", "edge", "prime", "infinite"];
