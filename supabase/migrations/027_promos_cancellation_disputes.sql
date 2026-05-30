-- Xyra Chat — Week 12 Session 3: promo codes, cancellation capture,
-- disputes, and the 30-day data-retention purge cron.

-- =====================================================================
-- PROMO_CODES — local mirror of Stripe Coupons + Promotion Codes.
-- Stripe is the source of truth for redemption validity; we mirror for
-- analytics + the admin UI. Operator-only (the Xyra team's org).
-- =====================================================================
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  stripe_coupon_id TEXT,
  stripe_promotion_code_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN
    ('discount','free_month','free_trial','trial_extension','custom_quote')),
  description TEXT,
  -- empty array = applies to all plans
  applicable_plans TEXT[] NOT NULL DEFAULT '{}',
  -- for trial codes: how many days to grant/extend
  trial_days INT,
  -- for discount codes: percent (1-100) OR fixed amount in cents
  percent_off INT,
  amount_off_cents INT,
  duration TEXT CHECK (duration IN ('once','repeating','forever')),
  duration_in_months INT,
  max_redemptions INT,
  redemption_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active
  ON promo_codes(active) WHERE deleted_at IS NULL;

-- =====================================================================
-- PROMO_REDEMPTIONS — one row per (code, org). Analytics + dedupe.
-- =====================================================================
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID REFERENCES promo_codes(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  stripe_invoice_id TEXT,
  amount_discounted_cents INT,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(promo_code_id, org_id)
);

-- =====================================================================
-- CANCELLATION_FEEDBACK — why customers cancel (or stay). Pure analytics;
-- the actual cancel happens in Stripe Portal. Org-scoped.
-- =====================================================================
CREATE TABLE IF NOT EXISTS cancellation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  plan_at_cancel TEXT,
  reason TEXT NOT NULL,
  reason_detail TEXT,
  canceled BOOLEAN NOT NULL DEFAULT false,   -- proceeded to portal
  retained BOOLEAN NOT NULL DEFAULT false,   -- pressed "keep my subscription"
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_org
  ON cancellation_feedback(org_id, created_at DESC);

-- =====================================================================
-- DISPUTES — Stripe chargebacks. ~7 days to respond or auto-lose.
-- Operator-only.
-- =====================================================================
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id TEXT NOT NULL UNIQUE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  stripe_charge_id TEXT,
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  evidence_due_by TIMESTAMPTZ,
  evidence_submitted_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_disputes_status
  ON disputes(status, evidence_due_by);

-- =====================================================================
-- RLS
-- promo_codes / promo_redemptions / disputes: operator-only — no client
-- policy at all (service-role-only access from admin actions). Customer
-- orgs never read these directly.
-- cancellation_feedback: an org member can INSERT their own org's row;
-- reads are operator-only via service role.
-- =====================================================================
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org insert" ON cancellation_feedback;
CREATE POLICY "org insert" ON cancellation_feedback FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =====================================================================
-- ORG CASCADE SOFT-DELETE — used by the retention purge + reusable for
-- GDPR. Soft-deletes the org + every org-scoped table that carries a
-- deleted_at column. SECURITY DEFINER so the service-role cron can run
-- it. Idempotent (re-running is a no-op once rows are already deleted).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.soft_delete_org(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Messages cascade via their conversation (no org_id column).
  UPDATE messages SET deleted_at = NOW()
    WHERE deleted_at IS NULL AND conversation_id IN (
      SELECT id FROM conversations WHERE org_id = p_org_id
    );
  UPDATE conversations SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE contacts SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE channels SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE bots SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE wa_templates SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE broadcasts SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE automations SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE api_keys SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE webhook_endpoints SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  -- Bot sources cascade via their bot.
  UPDATE bot_sources SET deleted_at = NOW()
    WHERE deleted_at IS NULL AND bot_id IN (SELECT id FROM bots WHERE org_id = p_org_id);
  -- Profiles: clear org link so members lose access (don't hard-delete
  -- their auth — that's the GDPR endpoint's job on explicit request).
  UPDATE profiles SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  -- Finally the org itself.
  UPDATE organizations SET deleted_at = NOW() WHERE id = p_org_id AND deleted_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_org(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_org(UUID) TO service_role;

-- =====================================================================
-- RETENTION PURGE CRON — daily. Calls /api/internal/retention-purge
-- (CRON_SECRET-authed) which finds canceled subs past data_retention_until
-- and runs soft_delete_org on each. Same app_config secret pattern as
-- migration 025's webhook retry.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trigger_retention_purge()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url CONSTANT TEXT := 'https://xyra-chat.vercel.app/api/internal/retention-purge';
  v_secret TEXT;
BEGIN
  SELECT value INTO v_secret FROM app_config WHERE key = 'cron_secret';
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN 0;
  END IF;
  -- Only fire if there's something due — avoids a daily no-op fetch.
  IF NOT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE status = 'canceled'
      AND data_retention_until IS NOT NULL
      AND data_retention_until < NOW()
  ) THEN
    RETURN 0;
  END IF;
  PERFORM http_post(
    v_url, '{}', 'application/json',
    ARRAY[http_header('Authorization', 'Bearer ' || v_secret)]
  );
  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_retention_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_retention_purge() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention_purge') THEN
    PERFORM cron.unschedule('retention_purge');
  END IF;
END $$;

-- Daily at 03:17 UTC (off-peak, avoids the top-of-hour stampede).
SELECT cron.schedule('retention_purge', '17 3 * * *',
  $$ SELECT public.trigger_retention_purge(); $$);

-- =====================================================================
-- EXTEND_TRIAL — atomic, server-side trial bump for promo redemption.
-- Computes the new trial end against the LIVE row inside one statement
-- (GREATEST(trial_ends_at, now()) + N days) so concurrent/duplicate
-- redemptions can't blind-overwrite with a stale absolute timestamp,
-- and can never SHORTEN an already-longer trial.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.extend_trial(
  p_org_id UUID,
  p_days INT,
  p_source TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE subscriptions
  SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW())
                      + make_interval(days => p_days),
      trial_source = p_source,
      trial_extended_count = trial_extended_count + 1,
      status = 'trialing'
  WHERE org_id = p_org_id;
$$;

REVOKE EXECUTE ON FUNCTION public.extend_trial(UUID, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_trial(UUID, INT, TEXT) TO service_role;

-- touch_updated_at trigger on disputes (function defined in migration 018).
DROP TRIGGER IF EXISTS touch_disputes_updated ON disputes;
CREATE TRIGGER touch_disputes_updated
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

NOTIFY pgrst, 'reload schema';
