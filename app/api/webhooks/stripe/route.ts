import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, bundleIdFromPriceId } from "@/lib/billing/stripe";
import { provisionBundle, clearAllBundleEntitlements } from "@/lib/billing/provision";
import { BUNDLES, type BundleId } from "@/lib/billing/bundles";
import { createAdminClient } from "@/lib/supabase/admin";

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
      case "invoice.paid":
        await onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // No-op for events we don't handle yet (charge.*, dispute.*,
        // coupon.*, etc.) — they land in Session 3.
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
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const resolvedBundleId = bundleId ?? (priceId ? bundleIdFromPriceId(priceId) : null);
  if (!resolvedBundleId || !BUNDLES[resolvedBundleId]) {
    console.error("[stripe webhook] could not resolve bundle id from price", priceId);
    return;
  }

  await syncSubscriptionRow(orgId, subscription, resolvedBundleId);
  await provisionBundle({
    orgId,
    bundleId: resolvedBundleId,
    stripeSubscriptionId: subscription.id,
    expiresAt: null,
  });
}

async function onSubscriptionUpdated(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id as string | undefined;
  if (!orgId) {
    console.warn("[stripe webhook] subscription.updated without org_id metadata");
    return;
  }
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const bundleId = priceId ? bundleIdFromPriceId(priceId) : null;
  if (!bundleId) {
    console.warn("[stripe webhook] subscription.updated without resolvable bundle");
    return;
  }
  await syncSubscriptionRow(orgId, subscription, bundleId);
  // Re-provision entitlements every time — handles plan upgrades AND
  // downgrades (the RPC wipes old `bundle:*` rows for that source).
  await provisionBundle({
    orgId,
    bundleId,
    stripeSubscriptionId: subscription.id,
    expiresAt: null,
  });
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
