// Plan tiers kept in code so we can tweak without DB migrations. The DB
// stores the org's CURRENT limit; when we change a plan, we update the
// subscription row to match.
//
// Pricing is illustrative — replace with the real numbers when Stripe
// is wired in (Week 14-15 launch prep).
export type PlanId = "free" | "starter" | "pro" | "scale" | "custom";

export type Plan = {
  id: PlanId;
  name: string;
  monthlyPriceEur: number | null;   // null = custom / enterprise
  monthlyAiTokensLimit: number;
  description: string;
  // Public API access flags (paid add-on per
  // project_api_monetization.md). When these limits move into the DB
  // for live admin-panel tuning, these become defaults / fallbacks.
  apiAccess: "none" | "read_only" | "full";
  // Soft rate limit (requests / minute). Enforced when Upstash is
  // wired up in the debug phase.
  apiRequestsPerMin: number;
  // Outbound webhook delivery budget per month.
  webhookDeliveriesPerMonth: number;
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceEur: 0,
    monthlyAiTokensLimit: 50_000,    // ~250 bot replies
    description:
      "Kick the tyres. ~250 AI replies/month, all channels.",
    apiAccess: "none",
    apiRequestsPerMin: 0,
    webhookDeliveriesPerMonth: 0,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPriceEur: 19,
    monthlyAiTokensLimit: 500_000,   // ~2,500 bot replies
    description: "Solo founders + small teams. 1 connected channel.",
    apiAccess: "read_only",
    apiRequestsPerMin: 100,
    webhookDeliveriesPerMonth: 10_000,
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceEur: 49,
    monthlyAiTokensLimit: 2_000_000, // ~10,000 bot replies
    description: "Growing teams. Unlimited channels + auto-translate.",
    apiAccess: "full",
    apiRequestsPerMin: 600,
    webhookDeliveriesPerMonth: 100_000,
  },
  scale: {
    id: "scale",
    name: "Scale",
    monthlyPriceEur: 199,
    monthlyAiTokensLimit: 20_000_000,
    description: "High-volume support / sales. Priority routing.",
    apiAccess: "full",
    apiRequestsPerMin: 3_000,
    webhookDeliveriesPerMonth: 1_000_000,
  },
  custom: {
    id: "custom",
    name: "Custom",
    monthlyPriceEur: null,
    monthlyAiTokensLimit: Number.MAX_SAFE_INTEGER,
    description: "Enterprise — bespoke limits + SLA.",
    apiAccess: "full",
    apiRequestsPerMin: 10_000,
    webhookDeliveriesPerMonth: Number.MAX_SAFE_INTEGER,
  },
};
