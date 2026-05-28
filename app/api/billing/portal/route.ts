import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";

export const runtime = "nodejs";

// POST /api/billing/portal
// Opens Stripe Customer Portal for the calling org's customer.
// Customer manages subscription, payment methods, invoices from there.
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
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No org" }, { status: 403 });
  }
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Only the org owner can manage billing." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer yet — complete a checkout first." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const returnUrl =
    process.env.STRIPE_CHECKOUT_CANCEL_URL ??
    `${new URL(req.url).origin}/settings/billing`;

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: returnUrl,
  });
  return NextResponse.json({ url: session.url });
}
