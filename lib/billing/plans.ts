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
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceEur: 0,
    monthlyAiTokensLimit: 50_000,    // ~250 bot replies
    description:
      "Kick the tyres. ~250 AI replies/month, all channels.",
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPriceEur: 19,
    monthlyAiTokensLimit: 500_000,   // ~2,500 bot replies
    description: "Solo founders + small teams. 1 connected channel.",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceEur: 49,
    monthlyAiTokensLimit: 2_000_000, // ~10,000 bot replies
    description: "Growing teams. Unlimited channels + auto-translate.",
  },
  scale: {
    id: "scale",
    name: "Scale",
    monthlyPriceEur: 199,
    monthlyAiTokensLimit: 20_000_000,
    description: "High-volume support / sales. Priority routing.",
  },
  custom: {
    id: "custom",
    name: "Custom",
    monthlyPriceEur: null,
    monthlyAiTokensLimit: Number.MAX_SAFE_INTEGER,
    description: "Enterprise — bespoke limits + SLA.",
  },
};
