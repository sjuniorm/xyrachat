import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { BannerBar } from "./billing-banner-bar";

// Server component: resolves the org's billing state into at most one
// banner message, rendered by the dismissible client <BannerBar>.
// Priority order (most urgent first): past_due → retention → canceling
// → trial-ending → AI-usage-high. Returns null when nothing's worth
// showing (the common case for a healthy active org).
export async function BillingBanner({ orgId }: { orgId: string }) {
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end, data_retention_until, trial_ends_at, monthly_ai_tokens_limit, tokens_used_this_month")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!sub) return null;

  const now = Date.now();
  const days = (iso: string | null) =>
    iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / (24 * 60 * 60 * 1000))) : null;

  // past_due — payment failed.
  if (sub.status === "past_due") {
    return (
      <BannerBar id="past_due" tone="red">
        Your last payment failed. Update your card to keep your service active —{" "}
        <Link href="/settings/billing" className="underline">manage billing</Link>.
      </BannerBar>
    );
  }

  // canceled + in retention window — data deletion countdown.
  if (sub.status === "canceled" && sub.data_retention_until) {
    const d = days(sub.data_retention_until);
    if (d !== null && new Date(sub.data_retention_until).getTime() > now) {
      return (
        <BannerBar id="retention" tone="red">
          Your subscription ended. Your data will be permanently deleted in {d} day{d === 1 ? "" : "s"}.{" "}
          <Link href="/settings/billing" className="underline">Reactivate</Link> to restore full access.
        </BannerBar>
      );
    }
  }

  // canceling — ends at period end, still has access.
  if (sub.status === "canceling" || sub.cancel_at_period_end) {
    const end = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "soon";
    return (
      <BannerBar id="canceling" tone="amber">
        Your subscription ends on {end}. <Link href="/settings/billing" className="underline">Reactivate</Link> anytime before then to keep your data.
      </BannerBar>
    );
  }

  // trialing — only warn in the last 3 days.
  if (sub.status === "trialing" && sub.trial_ends_at) {
    const d = days(sub.trial_ends_at);
    if (d !== null && d <= 3) {
      return (
        <BannerBar id="trial" tone="sky">
          Your trial ends in {d} day{d === 1 ? "" : "s"}. <Link href="/settings/billing" className="underline">Add a plan</Link> to keep going.
        </BannerBar>
      );
    }
  }

  // AI usage ≥ 80% on an active plan.
  const limit = Number(sub.monthly_ai_tokens_limit ?? 0);
  const used = Number(sub.tokens_used_this_month ?? 0);
  if (sub.status === "active" && limit > 0 && used / limit >= 0.8) {
    const pct = Math.round((used / limit) * 100);
    return (
      <BannerBar id="ai80" tone="amber">
        AI usage at {pct}% of your monthly limit. <Link href="/settings/billing" className="underline">Upgrade</Link> to avoid interruptions.
      </BannerBar>
    );
  }

  return null;
}
