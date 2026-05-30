import "server-only";
import { getStripe } from "./stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Auto-evidence for Stripe chargebacks. When a dispute opens, Stripe
// gives ~7 days to submit evidence or we auto-lose. We assemble what we
// can from our own data (org + owner identity, usage proof, subscription
// id, policy links) and submit via stripe.disputes.update.
//
// We have no audit_log table yet, so the "access activity" evidence is
// derived from message counts + last activity timestamps. Good enough to
// demonstrate the customer actively used a paid service — which is the
// core rebuttal for "product not received" / "unrecognized" disputes.
// =====================================================================

const TERMS_URL = "https://xyrachat.com/terms";

export async function submitDisputeEvidence(
  stripeDisputeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: dispute } = await admin
    .from("disputes")
    .select("id, org_id, stripe_charge_id, evidence_submitted_at")
    .eq("stripe_dispute_id", stripeDisputeId)
    .maybeSingle();
  if (!dispute) return { ok: false, error: "Dispute row not found." };

  // ATOMIC claim: flip evidence_submitted_at from NULL → now in a single
  // conditional UPDATE. Only one caller wins, so concurrent /
  // re-delivered dispute.created events can't double-submit evidence to
  // Stripe. If we don't get the row back, another caller already claimed
  // it — bail. On a later failure we reset the timestamp so it retries.
  const claimTs = new Date().toISOString();
  const { data: claimed } = await admin
    .from("disputes")
    .update({ evidence_submitted_at: claimTs })
    .eq("id", dispute.id)
    .is("evidence_submitted_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: true }; // already submitting/submitted elsewhere

  // Gather org + owner identity.
  let orgName = "Unknown";
  let ownerEmail: string | null = null;
  let ownerName: string | null = null;
  let orgCreatedAt: string | null = null;
  let usageSummary = "No usage data available.";
  let subscriptionId: string | null = null;

  if (dispute.org_id) {
    const [{ data: org }, { data: owner }, { data: sub }] = await Promise.all([
      admin.from("organizations").select("name, created_at").eq("id", dispute.org_id).maybeSingle(),
      admin
        .from("profiles")
        .select("full_name, email")
        .eq("org_id", dispute.org_id)
        .eq("role", "owner")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
      admin
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("org_id", dispute.org_id)
        .maybeSingle(),
    ]);
    orgName = org?.name ?? orgName;
    orgCreatedAt = org?.created_at ?? null;
    ownerEmail = owner?.email ?? null;
    ownerName = owner?.full_name ?? null;
    subscriptionId = sub?.stripe_subscription_id ?? null;

    // Usage proof: counts of channels / bots / messages + most recent activity.
    const [chan, bots, msgs, lastConv] = await Promise.all([
      admin.from("channels").select("id", { count: "exact", head: true }).eq("org_id", dispute.org_id),
      admin.from("bots").select("id", { count: "exact", head: true }).eq("org_id", dispute.org_id),
      admin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", dispute.org_id),
      admin
        .from("conversations")
        .select("last_message_at")
        .eq("org_id", dispute.org_id)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    usageSummary =
      `Customer signed up${orgCreatedAt ? ` on ${new Date(orgCreatedAt).toISOString().slice(0, 10)}` : ""} and actively used the platform: ` +
      `${chan.count ?? 0} messaging channel(s) connected, ${bots.count ?? 0} AI assistant(s) configured, ` +
      `${msgs.count ?? 0} conversation(s) handled` +
      `${lastConv.data?.last_message_at ? `, most recent activity ${new Date(lastConv.data.last_message_at).toISOString().slice(0, 10)}` : ""}. ` +
      `Xyra Chat is a multi-channel customer-messaging SaaS subscription billed monthly.`;
  }

  const evidence: Record<string, string> = {
    product_description:
      "Xyra Chat — multi-channel customer messaging SaaS (WhatsApp, Instagram, Telegram, Email) with AI chatbots, broadcasts and automations. Billed as a monthly subscription.",
    customer_name: ownerName ?? orgName,
    ...(ownerEmail ? { customer_email_address: ownerEmail } : {}),
    customer_purchase_ip: "",
    customer_communication: `${orgName} created an account and agreed to the Terms of Service at ${TERMS_URL}. ${usageSummary}`,
    service_documentation: usageSummary,
    uncategorized_text: subscriptionId
      ? `Stripe subscription: ${subscriptionId}. Customer can cancel any time via Settings → Billing; access continues to period end.`
      : "Customer can cancel any time via Settings → Billing; access continues to period end.",
    refund_policy_disclosure:
      "Subscription fees are non-refundable except as required by EU consumer law. Cancellation available self-serve in-app.",
    cancellation_policy_disclosure: `Cancellation policy: ${TERMS_URL}#cancellation`,
    cancellation_rebuttal:
      "Customer did not initiate a cancellation through the in-app Stripe Portal before filing this dispute.",
  };

  try {
    const stripe = getStripe();
    await stripe.disputes.update(stripeDisputeId, { evidence });
    // We already claimed evidence_submitted_at above (claimTs) — leave it.
    return { ok: true };
  } catch (err) {
    // Submission failed — release the claim so a retry (manual or a
    // later webhook re-delivery) can attempt again.
    await admin
      .from("disputes")
      .update({ evidence_submitted_at: null })
      .eq("id", dispute.id);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe evidence submission failed.",
    };
  }
}
