"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "./stripe";
import { createPromo, type CreatePromoInput, type PromoKind } from "./promo";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// Operator gate — same contract as admin-actions.ts.
async function requireOperator(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.role !== "owner") {
    return { ok: false, error: "Operator access is owner-only." };
  }
  const operatorOrg = process.env.XYRA_OPERATOR_ORG_ID;
  if (operatorOrg && profile.org_id !== operatorOrg) {
    return { ok: false, error: "Not the Xyra operator org." };
  }
  return { ok: true, userId: user.id };
}

export async function createPromoCode(
  input: CreatePromoInput,
): Promise<ActionResult<{ id: string; code: string }>> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  const res = await createPromo(input, op.userId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/settings/admin/promos");
  return { ok: true, data: { id: res.id, code: res.code } };
}

export async function disablePromoCode(id: string): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data: promo } = await admin
    .from("promo_codes")
    .select("stripe_promotion_code_id")
    .eq("id", id)
    .maybeSingle();
  // Deactivate in Stripe too (best-effort) so it stops validating there.
  if (promo?.stripe_promotion_code_id) {
    try {
      const stripe = getStripe();
      await stripe.promotionCodes.update(promo.stripe_promotion_code_id, { active: false });
    } catch {
      // local deactivation still proceeds
    }
  }
  const { error } = await admin
    .from("promo_codes")
    .update({ active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/admin/promos");
  return { ok: true };
}

// Seed the launch promo set. Idempotent-ish: skips codes that already
// exist locally. Returns how many it created.
export async function seedLaunchPromos(): Promise<ActionResult<{ created: number }>> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  const sixMonths = new Date(Date.now() + 182 * 24 * 60 * 60 * 1000).toISOString();
  const threeMonths = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000).toISOString();
  const seeds: CreatePromoInput[] = [
    {
      code: "LAUNCH50",
      kind: "discount",
      description: "50% off any monthly plan for 1 month",
      percentOff: 50,
      maxRedemptions: 1000,
      expiresAt: threeMonths,
    },
    {
      code: "FREEMONTH",
      kind: "free_month",
      description: "100% off the first month",
      maxRedemptions: 100,
    },
    {
      code: "BETA90",
      kind: "free_trial",
      description: "90-day free trial (no card required)",
      trialDays: 90,
      expiresAt: sixMonths,
    },
  ];
  let created = 0;
  for (const s of seeds) {
    const res = await createPromo(s, op.userId);
    if (res.ok) created += 1;
  }
  revalidatePath("/settings/admin/promos");
  return { ok: true, data: { created } };
}

// Customer-facing redeem is in /api/billing/promo/redeem (rate-limited),
// not here — keeps the operator surface separate from the customer one.
export type { PromoKind };
