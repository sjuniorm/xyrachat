import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, bundleIdFromPriceId } from "@/lib/billing/stripe";
import { provisionBundle, clearAllBundleEntitlements } from "@/lib/billing/provision";
import { recomputeAddonEntitlements, addonIdFromPriceId } from "@/lib/billing/addon-provision";
import { BUNDLES, type BundleId } from "@/lib/billing/bundles";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitDisputeEvidence } from "@/lib/billing/dispute-evidence";
import { sendTrialEndingEmail } from "@/lib/email/send";

export const runtime = "nodejs";

// Stripe webhook receiver. Signature-verified via the
// STRIPE_WEBHOOK_SECRET env var (whsec_*). Always returns 200 except
// for signature failures so Stripe doesn't retry storms of events we
// processed but failed to log.
//
// Events handled this session:
//   checkout.session.completed         — first-time subscribe
//   customer.subscription.updated      — plan change / cancel-at-period-end
//   customer.subscription.deleted      — final cancel
//   customer.subscription.trial_will_end — reminder email (Stripe-managed trials)
//   invoice.paid                       — renewal → reset monthly tokens
//   invoice.payment_failed             — flag past_due
//
// Promo / dispute / charge events land in Session 3.

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 401 },
    );
  }

  // Raw body needed for signature verification.
  const rawBody = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[stripe webhook] signature verification failed:", message);
    return NextResponse.json(
      { error: `Invalid signature: ${message}` },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  // Log every verified event for replay + debugging. webhook_log was
  // added in Week 3 — we extend its `provider` column via this insert.
  try {
    await admin.from("webhook_log").insert({
      provider: "stripe",
      signature_ok: true,
      payload: {
        type: event.type,
        id: event.id,
        data: event.data.object as unknown as Record<string, unknown>,
      },
    });
  } catch {
    // Never block the 200.
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
        await onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.trial_will_end":
        await onTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
        await onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "charge.dispute.created":
        await onDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      case "charge.dispute.updated":
      case "charge.dispute.closed":
        await onDisputeUpdated(event.data.object as Stripe.Dispute);
        break;
      default:
        // No-op for events we don't handle (coupon.*, etc.).
        break;
    }
  } catch (err) {
    // Log + still return 200 so Stripe doesn't retry forever; we have
    // the raw event in webhook_log for manual replay.
    console.error("[stripe webhook] handler failed:", err);
  }

  return NextResponse.json({ received: true });
}

// =====================================================================
// Event handlers
// =====================================================================

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  // We attached org_id + bundle_id to the checkout session's metadata at
  // creation time — fastest resolution path.
  const orgId =
    (session.metadata?.org_id as string | undefined) ??
    (typeof session.subscription === "object"
      ? (session.subscription?.metadata?.org_id as string | undefined)
      : undefined);
  if (!orgId) {
    console.error("[stripe webhook] checkout.completed without org_id metadata");
    return;
  }

  const bundleId =
    (session.metadata?.bundle_id as BundleId | undefined) ??
    (typeof session.subscription === "object"
      ? (session.subscription?.metadata?.bundle_id as BundleId | undefined)
      : undefined);

  // Resolve the subscription so we have the price + period end.
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!subscriptionId) {
    console.error("[stripe webhook] checkout.completed without subscription");
    return;
  }
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = basePriceId(subscription);
  const resolvedBundleId = bundleId ?? (priceId ? bundleIdFromPriceId(priceId) : null);
  if (!resolvedBundleId || !BUNDLES[resolvedBundleId]) {
    console.error("[stripe webhook] could not resolve bundle id from price", priceId);
    return;
  }

  await syncSubscriptionRow(orgId, subscription, resolvedBundleId);
  // Clear any prior bundle rows (e.g. lingering Trial entitlements) so the new
  // pack is the only bundle source — otherwise the Trial's permissive channel
  // flags (all channels = true) would survive into a restrictive paid plan via
  // most-permissive resolution. (Add-ons + per-org overrides use non-bundle:%
  // sources and survive.)
  await clearAllBundleEntitlements(orgId);
  await provisionBundle({
    orgId,
    bundleId: resolvedBundleId,
    stripeSubscriptionId: subscription.id,
    expiresAt: null,
  });

  // Record a promo redemption if a discount was applied at checkout, so
  // analytics + redemption_count stay accurate. Match Stripe's coupon to
  // our promo_codes mirror.
  await recordCheckoutPromo(orgId, session);
}

// Matches the checkout's applied coupon to our promo_codes mirror and
// upserts a redemption row. Best-effort — never throws into the webhook.
async function recordCheckoutPromo(orgId: string, session: Stripe.Checkout.Session) {
  try {
    const amountDiscount = session.total_details?.amount_discount ?? 0;
    if (amountDiscount <= 0) return;
    // Resolve the coupon id from the session's discounts.
    const stripe = getStripe();
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["total_details.breakdown.discounts.discount"],
    });
    const breakdown = (full.total_details as unknown as {
      breakdown?: { discounts?: Array<{ discount?: { coupon?: { id?: string } } }> };
    } | null)?.breakdown;
    const couponId = breakdown?.discounts?.[0]?.discount?.coupon?.id;
    if (!couponId) return;
    const admin = createAdminClient();
    const { data: promo } = await admin
      .from("promo_codes")
      .select("id, redemption_count")
      .eq("stripe_coupon_id", couponId)
      .maybeSingle();
    if (!promo) return;
    await admin.from("promo_redemptions").upsert(
      {
        promo_code_id: promo.id,
        org_id: orgId,
        amount_discounted_cents: amountDiscount,
      },
      { onConflict: "promo_code_id,org_id" },
    );
    // Derive the count from the (idempotent) redemptions table rather than
    // blindly incrementing — a re-delivered checkout.session.completed upserts
    // the same redemption row, so the count stays accurate instead of drifting
    // up + prematurely exhausting the code's max_redemptions cap.
    const { count } = await admin
      .from("promo_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", promo.id);
    await admin
      .from("promo_codes")
      .update({ redemption_count: count ?? (promo.redemption_count ?? 0) })
      .eq("id", promo.id);
  } catch (err) {
    console.warn("[stripe webhook] recordCheckoutPromo failed", err);
  }
}

// The base PLAN price among the subscription's items — i.e. the one that maps
// to a bundle. Add-on items (extra users, etc.) are also items on the same
// subscription, so we must NOT assume items.data[0] is the base.
function basePriceId(subscription: Stripe.Subscription): string | null {
  for (const it of subscription.items.data) {
    const pid = it.price.id;
    if (pid && bundleIdFromPriceId(pid)) return pid;
  }
  return subscription.items.data[0]?.price.id ?? null;
}

// Reconcile local org_addons against the subscription's actual items, BOTH ways
// (Stripe is the source of truth):
//   1. Cancel local rows whose Stripe item vanished (e.g. removed via Portal).
//   2. Adopt Stripe add-on items that have no local row (self-heal an orphan
//      from a failed purchase write — so a billed item still grants its
//      entitlement instead of silently charging for nothing).
async function reconcileOrgAddons(orgId: string, subscription: Stripe.Subscription) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: rows } = await admin
    .from("org_addons")
    .select("id, addon_id, stripe_subscription_item_id")
    .eq("org_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null);
  const local = (rows as Array<{ id: string; addon_id: string; stripe_subscription_item_id: string | null }> | null) ?? [];
  const liveItemIds = new Set(subscription.items.data.map((i) => i.id));
  const localItemIds = new Set(local.filter((r) => r.stripe_subscription_item_id).map((r) => r.stripe_subscription_item_id));
  const localAddonIds = new Set(local.map((r) => r.addon_id));

  // 1. Cancel local rows whose Stripe item disappeared.
  for (const r of local) {
    if (r.stripe_subscription_item_id && !liveItemIds.has(r.stripe_subscription_item_id)) {
      await admin.from("org_addons").update({ status: "canceled", deleted_at: now }).eq("id", r.id);
    }
  }

  // 2. Adopt orphaned add-on items present in Stripe but not locally.
  for (const item of subscription.items.data) {
    const addonId = addonIdFromPriceId(item.price.id);
    if (!addonId) continue;
    if (localItemIds.has(item.id)) continue; // already tracked
    if (localAddonIds.has(addonId)) continue; // a row for this add-on exists — avoid unique conflict
    await admin.from("org_addons").insert({
      org_id: orgId,
      addon_id: addonId,
      quantity: item.quantity ?? 1,
      stripe_subscription_item_id: item.id,
      status: "active",
    });
  }
}

async function onSubscriptionUpdated(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id as string | undefined;
  if (!orgId) {
    console.warn("[stripe webhook] subscription.updated without org_id metadata");
    return;
  }
  const priceId = basePriceId(subscription);
  const bundleId = priceId ? bundleIdFromPriceId(priceId) : null;
  if (!bundleId) {
    console.warn("[stripe webhook] subscription.updated without resolvable bundle");
    return;
  }
  await syncSubscriptionRow(orgId, subscription, bundleId);
  // Re-provision entitlements every time — handles plan upgrades AND downgrades.
  // The provision RPC only wipes rows for the NEW bundle's own source, so on a
  // plan CHANGE the prior bundle's rows would otherwise linger (most-permissive
  // resolution → the org keeps the old plan's higher limits, and a downgrade to
  // Social Lite wouldn't actually drop the inbox). Clear ALL bundle rows first
  // so the new pack is the only bundle source. (Per-org overrides + add-ons use
  // non-`bundle:%` sources and survive; add-ons are recomputed just below.)
  await clearAllBundleEntitlements(orgId);
  await provisionBundle({
    orgId,
    bundleId,
    stripeSubscriptionId: subscription.id,
    expiresAt: null,
  });
  // Then reconcile + recompute add-on entitlements against the (possibly new)
  // base pack. Order matters: base first, add-ons layer on top.
  await reconcileOrgAddons(orgId, subscription);
  await recomputeAddonEntitlements(orgId);
}

async function onSubscriptionDeleted(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id as string | undefined;
  if (!orgId) return;
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      // 30-day grace before automatic data deletion — see Session 3
      // pre-launch checklist. The cron-based purge ships there.
      data_retention_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      plan: "free",
    })
    .eq("org_id", orgId);
  // Wipe bundle entitlements. Per-org overrides survive — they'll be
  // valid until their own expires_at (if set).
  await clearAllBundleEntitlements(orgId);
  // The subscription that billed any add-ons is gone — drop their entitlements
  // + cancel the local rows so a future re-subscribe starts clean.
  await admin.from("org_entitlements").delete().eq("org_id", orgId).like("source", "addon:%");
  await admin
    .from("org_addons")
    .update({ status: "canceled", deleted_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .is("deleted_at", null);
}

// Stripe fires this ~3 days before a Stripe-MANAGED trial converts. App-managed
// trials (the norm here) are handled by the trial-reminders cron instead — they
// have no Stripe subscription, so this never double-fires for them. Future-proof
// for if we move trials onto Stripe trial_period_days. Fail-soft email.
async function onTrialWillEnd(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id as string | undefined;
  if (!orgId) return;
  const trialEndMs = subscription.trial_end ? subscription.trial_end * 1000 : null;
  const daysLeft = trialEndMs
    ? Math.max(1, Math.ceil((trialEndMs - Date.now()) / 86_400_000))
    : 3;
  const admin = createAdminClient();
  const [{ data: org }, { data: owner }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    admin
      .from("profiles")
      .select("email")
      .eq("org_id", orgId)
      .eq("role", "owner")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
  ]);
  if (owner?.email) {
    await sendTrialEndingEmail(owner.email, org?.name ?? "your workspace", daysLeft);
  }
}

async function onInvoicePaid(invoice: Stripe.Invoice) {
  // Renewals: reset the monthly AI token counter so the new billing
  // period starts fresh. We do this on invoice.paid (not subscription.
  // updated) because that's when Stripe confirms payment cleared.
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const orgId = subscription.metadata?.org_id as string | undefined;
  if (!orgId) return;

  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({
      tokens_used_this_month: 0,
      billing_cycle_start: new Date().toISOString(),
      // Belt-and-suspenders: surface the next-period end so the UI can
      // show "renews on …".
      current_period_end: subscriptionPeriodEndIso(subscription),
      status: "active",
    })
    .eq("org_id", orgId);
}

async function onInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const orgId = subscription.metadata?.org_id as string | undefined;
  if (!orgId) return;

  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("org_id", orgId);

  // Notify the workspace owner so they can fix the card before retention kicks
  // in. Fail-soft + gated on the Resend domain being configured (skips cleanly
  // until then) — a missed email must never break the webhook / leave the
  // status un-updated.
  try {
    const [{ data: org }, { data: owner }] = await Promise.all([
      admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      admin
        .from("profiles")
        .select("email")
        .eq("org_id", orgId)
        .eq("role", "owner")
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
    if (owner?.email) {
      const { sendPaymentFailedEmail } = await import("@/lib/email/send");
      await sendPaymentFailedEmail(owner.email, org?.name ?? "your workspace");
    }
  } catch (err) {
    console.error("[stripe webhook] payment-failed email send failed (continuing)", err);
  }
}

// Stripe moved the subscription→current_period_end onto each item in
// API 2025-09-30 (because subscriptions can now have items on different
// billing cadences). For our single-item subscriptions we just read the
// first item's period_end. Fall back to the legacy top-level field for
// older API responses.
function subscriptionPeriodEndIso(subscription: Stripe.Subscription): string | null {
  const raw = subscription as unknown as {
    current_period_end?: number | null;
    items?: { data?: Array<{ current_period_end?: number | null }> };
  };
  const legacy = raw.current_period_end;
  if (typeof legacy === "number") return new Date(legacy * 1000).toISOString();
  const fromItem = raw.items?.data?.[0]?.current_period_end;
  if (typeof fromItem === "number") return new Date(fromItem * 1000).toISOString();
  return null;
}

// Stripe moved the invoice→subscription link in API 2025-09-30. Older
// SDK shape: invoice.subscription. Newer shape: invoice.parent.
// subscription_details.subscription. Read both so we work on either.
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const raw = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  };
  const legacy = raw.subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;
  const next = raw.parent?.subscription_details?.subscription;
  if (typeof next === "string") return next;
  if (next && typeof next === "object") return next.id;
  return null;
}

// =====================================================================
// Helper: persist Stripe state into the subscriptions row.
// =====================================================================
async function syncSubscriptionRow(
  orgId: string,
  subscription: Stripe.Subscription,
  bundleId: BundleId,
) {
  const admin = createAdminClient();
  const item = subscription.items.data[0];
  const bundle = BUNDLES[bundleId];

  await admin
    .from("subscriptions")
    .update({
      stripe_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      stripe_subscription_id: subscription.id,
      stripe_price_id: item?.price.id ?? null,
      status:
        subscription.cancel_at_period_end
          ? "canceling"
          : (subscription.status as
              | "trialing"
              | "active"
              | "past_due"
              | "canceled"
              | "incomplete"
              | "unpaid"),
      plan: bundleId,
      monthly_ai_tokens_limit: parseInt(
        (bundle.entitlements["ai_tokens:monthly"] as string | undefined) ?? "50000",
        10,
      ),
      current_period_end: subscriptionPeriodEndIso(subscription),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
    })
    .eq("org_id", orgId);
}

// =====================================================================
// Disputes (chargebacks). On create: record the dispute, pause the org
// (likely-fraudulent), and auto-submit evidence. On update/close: sync
// status so the admin disputes UI reflects the outcome.
// =====================================================================
async function onDisputeCreated(dispute: Stripe.Dispute) {
  const admin = createAdminClient();
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? null;

  // Resolve the org via the charge's customer → subscriptions row.
  let orgId: string | null = null;
  try {
    if (chargeId) {
      const stripe = getStripe();
      const charge = await stripe.charges.retrieve(chargeId);
      const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;
      if (customerId) {
        const { data: sub } = await admin
          .from("subscriptions")
          .select("org_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        orgId = sub?.org_id ?? null;
      }
    }
  } catch (err) {
    console.warn("[stripe webhook] dispute org resolution failed", err);
  }

  // Insert the dispute row, but DON'T clobber status on a re-delivery.
  // Stripe can deliver events out of order — a `.closed`/`.updated`
  // carrying a newer status (won/lost/under_review) may arrive before a
  // re-delivered `.created`. So: fresh row → insert with the created
  // status; existing row → only backfill org/charge linkage, never
  // regress the status (onDisputeUpdated owns status transitions).
  const { data: existing } = await admin
    .from("disputes")
    .select("id, org_id")
    .eq("stripe_dispute_id", dispute.id)
    .maybeSingle();
  if (existing) {
    if (!existing.org_id && orgId) {
      await admin
        .from("disputes")
        .update({ org_id: orgId, stripe_charge_id: chargeId })
        .eq("id", existing.id);
    }
  } else {
    await admin.from("disputes").insert({
      stripe_dispute_id: dispute.id,
      org_id: orgId,
      stripe_charge_id: chargeId,
      amount_cents: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
      evidence_due_by: dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
        : null,
    });
  }

  // Pause the org's service — a dispute usually means fraud or a hard
  // chargeback; don't keep serving until it resolves.
  if (orgId) {
    await admin.from("subscriptions").update({ status: "past_due" }).eq("org_id", orgId);
  }

  // Auto-submit evidence (within Stripe's deadline). Only when the
  // dispute actually needs a response.
  if (dispute.status === "needs_response" || dispute.status === "warning_needs_response") {
    await submitDisputeEvidence(dispute.id);
  }
}

async function onDisputeUpdated(dispute: Stripe.Dispute) {
  const admin = createAdminClient();
  await admin
    .from("disputes")
    .update({
      status: dispute.status,
      evidence_due_by: dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
        : null,
    })
    .eq("stripe_dispute_id", dispute.id);
}
