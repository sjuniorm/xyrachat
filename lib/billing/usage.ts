import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConsumeResult = {
  ok: boolean;
  plan: string;
  tokens_used_this_month: number;
  monthly_ai_tokens_limit: number;
  billing_cycle_start: string | null;
  // Convenience derived values for callers.
  tokens_remaining: number;
  percent_used: number;
};

// Pre-flight check: returns { ok: true } if the org has ANY headroom left
// in this billing cycle. Doesn't burn tokens. Used BEFORE calling the
// provider so we can refuse cleanly instead of paying for a call we'd
// then drop.
export async function checkAiQuota(orgId: string): Promise<ConsumeResult> {
  return consumeAiTokens(orgId, 0);
}

// Atomic check + monthly rollover + increment via the
// consume_ai_tokens(p_org_id, p_amount) SQL function. Always returns
// the post-mutation state so callers can surface "X tokens remaining"
// to the user.
export async function consumeAiTokens(
  orgId: string,
  amount: number,
): Promise<ConsumeResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_ai_tokens", {
    p_org_id: orgId,
    p_amount: Math.max(0, Math.round(amount)),
  });
  if (error) {
    console.warn("[billing] consume_ai_tokens RPC failed", error);
    // Fail-open ish: don't block the user on a billing-system glitch.
    // We'd rather temporarily over-serve than refuse a legit reply.
    return {
      ok: true,
      plan: "unknown",
      tokens_used_this_month: 0,
      monthly_ai_tokens_limit: Number.MAX_SAFE_INTEGER,
      billing_cycle_start: null,
      tokens_remaining: Number.MAX_SAFE_INTEGER,
      percent_used: 0,
    };
  }
  const row = (data as Array<{
    ok: boolean;
    plan: string;
    tokens_used_this_month: number;
    monthly_ai_tokens_limit: number;
    billing_cycle_start: string;
  }>)[0];
  if (!row) {
    return {
      ok: false,
      plan: "none",
      tokens_used_this_month: 0,
      monthly_ai_tokens_limit: 0,
      billing_cycle_start: null,
      tokens_remaining: 0,
      percent_used: 100,
    };
  }
  const remaining = Math.max(
    0,
    row.monthly_ai_tokens_limit - row.tokens_used_this_month,
  );
  const percent =
    row.monthly_ai_tokens_limit > 0
      ? (row.tokens_used_this_month / row.monthly_ai_tokens_limit) * 100
      : 100;
  return {
    ok: row.ok,
    plan: row.plan,
    tokens_used_this_month: row.tokens_used_this_month,
    monthly_ai_tokens_limit: row.monthly_ai_tokens_limit,
    billing_cycle_start: row.billing_cycle_start,
    tokens_remaining: remaining,
    percent_used: Number(percent.toFixed(2)),
  };
}
