// =====================================================================
// Plan bundles — what entitlements each plan grants.
//
// These are the FOUR fixed bundles a customer can buy via Stripe Checkout.
// Per-customer custom deals layer on top by inserting org_entitlements
// rows with `source = 'custom_quote:<id>'` or `source = 'manual:<uuid>'`.
//
// Editing a bundle is a code deploy. The Stripe webhook reads from this
// file when provisioning entitlements on checkout / upgrade / downgrade.
//
// VALUE encoding (matches lib/billing/entitlements.ts):
//   number  → '1000'        (positive int)
//   unlimited → '-1'        (sentinel; becomes Infinity at read time)
//   boolean   → 'true'/'false'
// =====================================================================

import type { FeatureKey } from "./entitlements";

export type BundleId = "trial" | "starter" | "pro" | "enterprise";

export type Bundle = {
  id: BundleId;
  name: string;
  // Monthly EUR price for display + Stripe Price selection. null = free.
  monthlyPriceEur: number | null;
  // Stripe Price ID for the monthly checkout. Set when Stripe products
  // are created — fill in via env override in dev, hard-code at launch.
  // We allow undefined here so the bundle map can exist before Stripe
  // products are configured.
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  // Trial length in days when a customer signs up to this bundle.
  // Trial bundle uses its own value; paid bundles use 0 unless given
  // a trial via promo code / manual extension.
  trialDays: number;
  description: string;
  // Source string written to org_entitlements when this bundle is
  // provisioned. Lets us undo just this bundle later (e.g. on
  // downgrade) without touching per-org overrides.
  entitlementSource: string;
  // The actual feature map.
  entitlements: Partial<Record<FeatureKey, string>>;
};

export const BUNDLES: Record<BundleId, Bundle> = {
  trial: {
    id: "trial",
    name: "Trial",
    monthlyPriceEur: null,
    trialDays: 14,
    description: "14-day free trial. 1 channel, 1 bot, 500 conversations.",
    entitlementSource: "bundle:trial",
    entitlements: {
      "channels:max": "1",
      "channels:whatsapp": "true",
      "channels:instagram": "true",
      "channels:telegram": "true",
      "channels:email": "true",
      "team_members:max": "1",
      "bots:max": "1",
      "bots:knowledge_sources_max": "5",
      "bots:voice_transcription": "false",
      "ai_tokens:monthly": "50000",
      "feature:broadcasts": "false",
      "broadcasts:monthly": "0",
      "broadcasts:wa_conversations_included": "500",
      "feature:automations": "true",
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
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPriceEur: 39,
    trialDays: 7,
    description: "€39/mo. 3 channels, 3 team members, 1,000 WA conversations included.",
    entitlementSource: "bundle:starter",
    entitlements: {
      "channels:max": "3",
      "channels:whatsapp": "true",
      "channels:instagram": "true",
      "channels:telegram": "true",
      "channels:email": "true",
      "team_members:max": "3",
      "bots:max": "1",
      "bots:knowledge_sources_max": "20",
      "bots:voice_transcription": "false",
      "ai_tokens:monthly": "500000",
      "feature:broadcasts": "true",
      "broadcasts:monthly": "1000",
      "broadcasts:wa_conversations_included": "1000",
      "feature:automations": "true",
      "api:read": "true",
      "api:write": "false",
      "api:requests_per_min": "100",
      "api:webhook_deliveries_monthly": "10000",
      "integration:make": "true",
      "integration:zapier": "true",
      "integration:n8n": "true",
      "feature:whitelabel": "false",
      "feature:priority_support": "false",
      "feature:custom_integrations": "false",
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceEur: 99,
    trialDays: 14,
    description: "€99/mo. Unlimited channels, 10 team members, 5,000 WA conversations included, API access.",
    entitlementSource: "bundle:pro",
    entitlements: {
      "channels:max": "-1",
      "channels:whatsapp": "true",
      "channels:instagram": "true",
      "channels:telegram": "true",
      "channels:email": "true",
      "team_members:max": "10",
      "bots:max": "3",
      "bots:knowledge_sources_max": "-1",
      "bots:voice_transcription": "true",
      "ai_tokens:monthly": "2500000",
      "feature:broadcasts": "true",
      "broadcasts:monthly": "10000",
      "broadcasts:wa_conversations_included": "5000",
      "feature:automations": "true",
      "api:read": "true",
      "api:write": "true",
      "api:requests_per_min": "600",
      "api:webhook_deliveries_monthly": "100000",
      "integration:make": "true",
      "integration:zapier": "true",
      "integration:n8n": "true",
      "feature:whitelabel": "false",
      "feature:priority_support": "false",
      "feature:custom_integrations": "false",
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyPriceEur: 249,
    trialDays: 30,
    description: "€249/mo. Unlimited everything. White-label option, priority support.",
    entitlementSource: "bundle:enterprise",
    entitlements: {
      "channels:max": "-1",
      "channels:whatsapp": "true",
      "channels:instagram": "true",
      "channels:telegram": "true",
      "channels:email": "true",
      "team_members:max": "-1",
      "bots:max": "-1",
      "bots:knowledge_sources_max": "-1",
      "bots:voice_transcription": "true",
      "ai_tokens:monthly": "10000000",
      "feature:broadcasts": "true",
      "broadcasts:monthly": "-1",
      "broadcasts:wa_conversations_included": "25000",
      "feature:automations": "true",
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

// Map a Stripe Price ID back to a bundle. Used by the webhook handler
// on checkout.session.completed.
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
