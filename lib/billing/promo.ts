import "server-only";
import { getStripe } from "./stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Promo engine. Two flavours:
//   1. Stripe-backed discounts (kind = discount / free_month / custom_quote)
//      — create a Coupon + Promotion Code in Stripe; redemption happens at
//      Checkout (allow_promotion_codes) or via subscriptions.update.
//   2. Trial codes (kind = free_trial / trial_extension) — NO Stripe object;
//      we just bump subscriptions.trial_ends_at directly. No payment.
//
// Stripe is the source of truth for discount validity + per-redemption
// limits; we mirror into promo_codes for analytics + the admin UI.
// =====================================================================

export type PromoKind =
  | "discount"
  | "free_month"
  | "free_trial"
  | "trial_extension"
  | "custom_quote";

export type CreatePromoInput = {
  code: string;
  kind: PromoKind;
  description?: string;
  applicablePlans?: string[];
  // discount / free_month
  percentOff?: number;
  amountOffCents?: number;
  durationInMonths?: number; // for repeating discounts
  // trial codes
  trialDays?: number;
  maxRedemptions?: number;
  expiresAt?: string | null; // ISO
};

// Create the promo. For Stripe-backed kinds, creates Coupon +
// Promotion Code. For trial kinds, skips Stripe entirely.
export async function createPromo(
  input: CreatePromoInput,
  createdBy: string,
): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    return { ok: false, error: "Code must be 3-40 chars: A-Z, 0-9, _ or -." };
  }
  const admin = createAdminClient();

  // Local uniqueness pre-check (Stripe also enforces on the promo code).
  const { data: existing } = await admin
    .from("promo_codes")
    .select("id")
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return { ok: false, error: `Code ${code} already exists.` };

  let stripeCouponId: string | null = null;
  let stripePromotionCodeId: string | null = null;
  let percentOff: number | null = null;
  let amountOffCents: number | null = null;
  let duration: "once" | "repeating" | "forever" | null = null;
  let durationInMonths: number | null = null;

  const isStripeBacked =
    input.kind === "discount" ||
    input.kind === "free_month" ||
    input.kind === "custom_quote";

  if (isStripeBacked) {
    const stripe = getStripe();
    // Resolve the discount shape.
    if (input.kind === "free_month") {
      percentOff = 100;
      duration = input.durationInMonths && input.durationInMonths > 1 ? "repeating" : "once";
      durationInMonths = input.durationInMonths && input.durationInMonths > 1 ? input.durationInMonths : null;
    } else {
      // discount / custom_quote
      if (input.percentOff && input.percentOff > 0) {
        percentOff = Math.min(100, Math.round(input.percentOff));
      } else if (input.amountOffCents && input.amountOffCents > 0) {
        amountOffCents = Math.round(input.amountOffCents);
      } else {
        return { ok: false, error: "Provide percent_off or amount_off for a discount." };
      }
      if (input.durationInMonths && input.durationInMonths > 0) {
        duration = "repeating";
        durationInMonths = input.durationInMonths;
      } else {
        duration = "once";
      }
    }

    try {
      const coupon = await stripe.coupons.create({
        ...(percentOff != null ? { percent_off: percentOff } : {}),
        ...(amountOffCents != null ? { amount_off: amountOffCents, currency: "eur" } : {}),
        duration: duration ?? "once",
        ...(durationInMonths != null ? { duration_in_months: durationInMonths } : {}),
        ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
        ...(input.expiresAt ? { redeem_by: Math.floor(new Date(input.expiresAt).getTime() / 1000) } : {}),
        name: code,
      });
      stripeCouponId = coupon.id;
      const promo = await stripe.promotionCodes.create({
        // Stripe API 2026-05-27 (dahlia) replaced the flat `coupon` field
        // with a `promotion` object.
        promotion: { type: "coupon", coupon: coupon.id },
        code,
        ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
        ...(input.expiresAt ? { expires_at: Math.floor(new Date(input.expiresAt).getTime() / 1000) } : {}),
      });
      stripePromotionCodeId = promo.id;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Stripe coupon creation failed.",
      };
    }
  }

  const { data, error } = await admin
    .from("promo_codes")
    .insert({
      code,
      stripe_coupon_id: stripeCouponId,
      stripe_promotion_code_id: stripePromotionCodeId,
      kind: input.kind,
      description: input.description ?? null,
      applicable_plans: input.applicablePlans ?? [],
      trial_days: input.trialDays ?? null,
      percent_off: percentOff,
      amount_off_cents: amountOffCents,
      duration,
      duration_in_months: durationInMonths,
      max_redemptions: input.maxRedemptions ?? null,
      expires_at: input.expiresAt ?? null,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id, code };
}

// Redeem a code for an org. Trial codes bump trial_ends_at directly;
// Stripe-backed codes attach the coupon to the org's live subscription
// (if any) — otherwise they're applied at next checkout.
export async function redeemPromo(
  orgId: string,
  rawCode: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const code = rawCode.trim().toUpperCase();
  const admin = createAdminClient();
  const { data: promo } = await admin
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  // Generic error for both "missing" and "expired/inactive" — don't leak
  // which codes exist (anti-enumeration).
  if (!promo) return { ok: false, error: "Code is invalid or expired." };
  if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Code is invalid or expired." };
  }
  if (
    promo.max_redemptions != null &&
    promo.redemption_count >= promo.max_redemptions
  ) {
    return { ok: false, error: "Code is invalid or expired." };
  }

  // CLAIM THE REDEMPTION SLOT ATOMICALLY. We INSERT the
  // promo_redemptions row FIRST and let the UNIQUE(promo_code_id, org_id)
  // constraint be the guard — NOT a racy SELECT-then-write. This closes
  // the TOCTOU window where N parallel requests with the same code all
  // pass a "have you used this?" check and then each apply the benefit.
  // Only the one request that wins the INSERT proceeds; the rest get a
  // 23505 unique-violation and bail. (Critical for trial codes, which
  // have no Stripe-side redemption cap.)
  const { error: claimErr } = await admin
    .from("promo_redemptions")
    .insert({ promo_code_id: promo.id, org_id: orgId });
  if (claimErr) {
    // 23505 = unique_violation → already redeemed (or a concurrent
    // request just won the race). Either way: one redemption per org.
    if ((claimErr as { code?: string }).code === "23505") {
      return { ok: false, error: "You've already used this code." };
    }
    return { ok: false, error: "Couldn't redeem code." };
  }
  // From here we OWN the redemption row. On any later failure we delete
  // it so the org can retry.
  const releaseClaim = async () => {
    await admin
      .from("promo_redemptions")
      .delete()
      .eq("promo_code_id", promo.id)
      .eq("org_id", orgId);
  };

  // Plan applicability (only meaningful for discounts attached to a sub).
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan, stripe_subscription_id, trial_ends_at, trial_extended_count")
    .eq("org_id", orgId)
    .maybeSingle();

  if (
    promo.applicable_plans &&
    promo.applicable_plans.length > 0 &&
    sub?.plan &&
    !promo.applicable_plans.includes(sub.plan)
  ) {
    await releaseClaim();
    return { ok: false, error: "This code doesn't apply to your plan." };
  }

  // ---- Trial codes: no Stripe, just extend the trial ----
  if (promo.kind === "free_trial" || promo.kind === "trial_extension") {
    const days = promo.trial_days ?? 0;
    if (days <= 0) {
      await releaseClaim();
      return { ok: false, error: "Code is invalid or expired." };
    }
    // Atomic, server-side trial bump so even a duplicate winner can't
    // blind-overwrite with a stale absolute timestamp. GREATEST guards
    // against shortening an already-longer trial.
    const { error: bumpErr } = await admin.rpc("extend_trial", {
      p_org_id: orgId,
      p_days: days,
      p_source: `promo:${code}`,
    });
    if (bumpErr) {
      await releaseClaim();
      return { ok: false, error: "Couldn't apply the trial extension." };
    }
    await bumpRedemptionCount(promo.id);
    return { ok: true, message: `Trial extended by ${days} days.` };
  }

  // ---- Stripe-backed: attach coupon to the live subscription ----
  if (!sub?.stripe_subscription_id) {
    // No active sub — the code applies at checkout (allow_promotion_codes
    // shows the field). The claim row stands as recorded intent.
    await bumpRedemptionCount(promo.id);
    return {
      ok: true,
      message: "Code saved — it'll apply when you upgrade at checkout.",
    };
  }
  if (!promo.stripe_coupon_id) {
    await releaseClaim();
    return { ok: false, error: "Code is invalid or expired." };
  }
  try {
    const stripe = getStripe();
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      discounts: [{ coupon: promo.stripe_coupon_id }],
    });
  } catch (err) {
    await releaseClaim();
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't apply the discount.",
    };
  }
  await bumpRedemptionCount(promo.id);
  return { ok: true, message: "Discount applied to your subscription." };
}

// Best-effort analytics counter bump (the real per-org guard is the
// UNIQUE constraint claimed above; this is just for the admin display).
async function bumpRedemptionCount(promoCodeId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("promo_codes")
    .select("redemption_count")
    .eq("id", promoCodeId)
    .maybeSingle();
  await admin
    .from("promo_codes")
    .update({ redemption_count: (row?.redemption_count ?? 0) + 1 })
    .eq("id", promoCodeId);
}
