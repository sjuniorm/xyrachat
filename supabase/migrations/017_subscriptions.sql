-- Xyra Chat — Week 7.5: per-org AI token budget (subscriptions).
--
-- Every AI call (bot generation, message-assist, suggest-reply, translate,
-- embeddings, auto-translate) checks `subscriptions.tokens_used_this_month`
-- against `monthly_ai_tokens_limit` BEFORE spending, then increments AFTER
-- the provider returns usage.
--
-- This is the safety guard against:
--   - a compromised user account spamming /api/ai/*
--   - a runaway bot conversation
--   - a single client driving an unexpected month-over-month spike
--
-- Plans are kept in code (lib/billing/plans.ts), not in the DB, so we can
-- tweak tiers without migrations. The DB just holds the org's current
-- limit + counter.

-- =====================================================================
-- SUBSCRIPTIONS — one per org
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  monthly_ai_tokens_limit BIGINT NOT NULL DEFAULT 50000,
  tokens_used_this_month BIGINT NOT NULL DEFAULT 0,
  billing_cycle_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org
  ON subscriptions(org_id) WHERE deleted_at IS NULL;

-- =====================================================================
-- RLS — agents in an org can SEE their subscription (for usage display)
-- but only the service role can mutate it. We mutate via SECURITY DEFINER
-- functions below; the client never writes directly.
-- =====================================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read" ON subscriptions;
CREATE POLICY "org read" ON subscriptions FOR SELECT
  USING (
    org_id = public.current_user_org_id()
    AND deleted_at IS NULL
  );

-- =====================================================================
-- Auto-create a free subscription whenever an org is created. This way
-- every org always has a row to check against — no NULL-handling edge
-- case in the AI gates.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO subscriptions (org_id, plan, monthly_ai_tokens_limit)
  VALUES (NEW.id, 'free', 50000)
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_subscription_on_org_insert ON organizations;
CREATE TRIGGER create_subscription_on_org_insert
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_subscription();

-- Backfill: ensure every existing org has a subscription row.
INSERT INTO subscriptions (org_id, plan, monthly_ai_tokens_limit)
SELECT o.id, 'free', 50000
FROM organizations o
LEFT JOIN subscriptions s ON s.org_id = o.id
WHERE s.id IS NULL;

-- =====================================================================
-- consume_ai_tokens — atomic check + monthly rollover + increment.
-- Returns the row AFTER mutation so callers can also surface "tokens left"
-- in error responses. Returns NULL when the limit would be exceeded.
--
-- Rollover: if billing_cycle_start is >= 30 days ago, advance the cycle
-- by the appropriate number of 30-day periods and reset the counter
-- before checking. This keeps cycles aligned to the org's onboarding
-- date instead of calendar months.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.consume_ai_tokens(
  p_org_id UUID,
  p_amount BIGINT
)
RETURNS TABLE(
  ok BOOLEAN,
  plan TEXT,
  tokens_used_this_month BIGINT,
  monthly_ai_tokens_limit BIGINT,
  billing_cycle_start TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
  v_cycles_elapsed INT;
BEGIN
  SELECT * INTO v_sub FROM subscriptions
    WHERE org_id = p_org_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'none'::TEXT, 0::BIGINT, 0::BIGINT, NOW();
    RETURN;
  END IF;

  -- Rollover: advance the cycle start in 30-day increments until it's
  -- within the current 30-day window. Reset the counter the first time
  -- we advance.
  v_cycles_elapsed := FLOOR(
    EXTRACT(EPOCH FROM (NOW() - v_sub.billing_cycle_start))
    / EXTRACT(EPOCH FROM INTERVAL '30 days')
  )::INT;
  IF v_cycles_elapsed >= 1 THEN
    UPDATE subscriptions
    SET tokens_used_this_month = 0,
        billing_cycle_start = v_sub.billing_cycle_start
          + (v_cycles_elapsed * INTERVAL '30 days')
    WHERE id = v_sub.id
    RETURNING * INTO v_sub;
  END IF;

  -- Quota check. p_amount = 0 lets callers do a pre-flight check
  -- without spending anything.
  IF v_sub.tokens_used_this_month + p_amount > v_sub.monthly_ai_tokens_limit THEN
    RETURN QUERY SELECT
      FALSE,
      v_sub.plan,
      v_sub.tokens_used_this_month,
      v_sub.monthly_ai_tokens_limit,
      v_sub.billing_cycle_start;
    RETURN;
  END IF;

  -- Spend.
  IF p_amount > 0 THEN
    UPDATE subscriptions
    SET tokens_used_this_month = tokens_used_this_month + p_amount
    WHERE id = v_sub.id
    RETURNING * INTO v_sub;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_sub.plan,
    v_sub.tokens_used_this_month,
    v_sub.monthly_ai_tokens_limit,
    v_sub.billing_cycle_start;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_tokens(UUID, BIGINT)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ai_tokens(UUID, BIGINT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
