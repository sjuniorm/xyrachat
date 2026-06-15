import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, priceIdForBundle } from "@/lib/billing/stripe";
import { BUNDLES, type BundleId } from "@/lib/billing/bundles";

export const runtime = "nodejs";

// POST /api/billing/checkout
// body: { bundle: 'solo'|'core'|'edge'|'prime'|'infinite', interval: 'monthly'|'yearly' }
// Returns: { url: 'https://checkout.stripe.com/...' }
//
// Creates (or reuses) the Stripe customer for the org, opens a checkout
// session for the requested bundle + interval, returns the hosted-checkout
// URL. The webhook (checkout.session.completed) is what actually
// provisions entitlements + flips subscriptions.status to active.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No org" }, { status: 403 });
  }
  // Only owners can change billing.
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Only the org owner can manage billing." },
      { status: 403 },
    );
  }

  let body: { bundle?: BundleId; interval?: "monthly" | "yearly" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bundleId = body.bundle;
  const interval = body.interval ?? "monthly";
  if (!bundleId || !BUNDLES[bundleId]) {
    return NextResponse.json(
      { error: "Pick a valid bundle (solo / core / edge / prime / infinite)." },
      { status: 400 },
    );
  }
  if (bundleId === "trial") {
    return NextResponse.json(
      { error: "Trial doesn't go through checkout — it's auto-provisioned on signup." },
      { status: 400 },
    );
  }
  const priceId = priceIdForBundle(bundleId, interval);
  if (!priceId) {
    return NextResponse.json(
      {
        error: `Stripe price isn't configured for ${bundleId}/${interval}. Set STRIPE_PRICE_${bundleId.toUpperCase()}_${interval.toUpperCase()} in env.`,
      },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const stripe = getStripe();

  // Find or create the Stripe customer for this org.
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", profile.org_id)
    .maybeSingle();

  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email ?? user.email ?? undefined,
      name: profile.full_name ?? undefined,
      metadata: { org_id: profile.org_id },
    });
    customerId = customer.id;
    // Persist immediately so retries don't double-create customers.
    await admin
      .from("subscriptions")
      .update({ stripe_customer_id: customerId })
      .eq("org_id", profile.org_id);
  }

  const successUrl =
    process.env.STRIPE_CHECKOUT_SUCCESS_URL ??
    `${new URL(req.url).origin}/settings/billing?upgraded=true`;
  const cancelUrl =
    process.env.STRIPE_CHECKOUT_CANCEL_URL ??
    `${new URL(req.url).origin}/settings/billing`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Stripe shows the "Have a code?" field at checkout so promo codes
    // from Session 3 work natively without us re-implementing the UI.
    allow_promotion_codes: true,
    // Metadata is echoed on every webhook event for this subscription
    // — lets the webhook handler resolve org_id without a DB round-trip.
    subscription_data: {
      metadata: {
        org_id: profile.org_id,
        bundle_id: bundleId,
      },
    },
    metadata: {
      org_id: profile.org_id,
      bundle_id: bundleId,
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Checkout session has no URL" }, { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}
