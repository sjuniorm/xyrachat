-- Xyra Chat — Week 12 Session 1: entitlements model + Stripe wiring.
--
-- WHY entitlements (not plan-strings):
--   The product needs to sell both fixed bundles (Trial/Starter/Pro/
--   Enterprise) AND per-customer custom deals ("partner X pays €150 for
--   these specific features"). Hard-coded `plan === 'pro'` checks make
--   the second case impossible without a multi-day refactor later — so
--   we go entitlements-first.
--
-- ARCHITECTURE:
--   org_entitlements is the authoritative source for every gate.
--   subscriptions.plan stays as a UI LABEL only (the "primary bundle"
--   the customer thinks they bought). Real gates query
--   checkEntitlement(orgId, feature_key).
--
--   Bundles (the four plans) live in lib/billing/bundles.ts as code —
--   they provision a set of entitlement rows when a customer subscribes
--   via Stripe webhook. Editing a bundle = a code deploy. Per-org
--   overrides = INSERT rows directly into org_entitlements (Session 3
--   admin UI lets us do this from a dashboard).

-- =====================================================================
-- ORG_ENTITLEMENTS — feature_key + value + source per org
-- =====================================================================
CREATE TABLE IF NOT EXISTS org_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  -- Stable string key, e.g. 'channels:max', 'ai_tokens:monthly',
  -- 'feature:broadcasts', 'integration:make', 'whitelabel'. Format is
  -- `<resource>:<aspect>` for numeric/boolean limits, or just
  -- `feature:<name>` for binary on/off feature flags.
  feature_key TEXT NOT NULL,
  -- Stored as TEXT for flexibility — code parses to int/bool as needed.
  -- 'true' / 'false' for booleans, '1000' / '-1' for numbers (-1 means
  -- unlimited). Keeping it text-based means we don't need a column-type
  -- migration when we add a new entitlement category.
  value TEXT NOT NULL,
  -- WHERE the entitlement came from. Drives the admin UI ("this came
  -- from the Pro bundle vs a custom quote"). Examples:
  --   'bundle:pro'      — provisioned by the Pro plan
  --   'bundle:starter'  — provisioned by the Starter plan
  --   'manual:<uuid>'   — granted by a Xyra admin (user uuid)
  --   'custom_quote:<id>' — line item on a Stripe custom quote
  --   'promo:<code>'    — granted by a promo code
  --   'trial'           — temporary, expires when trial ends
  source TEXT NOT NULL DEFAULT 'manual',
  -- Optional expiry — for trials, promo codes, or time-limited deals.
  expires_at TIMESTAMPTZ,
  -- Optional Stripe references for traceability.
  stripe_subscription_id TEXT,
  stripe_quote_id TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per (org, feature_key) for entitlements that come from the
-- primary bundle. Overrides + add-ons can layer extra rows with
-- different sources — `getEntitlements()` picks the most-permissive
-- value. UNIQUE on (org_id, source, feature_key) so a bundle update
-- can UPSERT cleanly without dup rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_entitlements_unique
  ON org_entitlements(org_id, source, feature_key);

CREATE INDEX IF NOT EXISTS idx_org_entitlements_org
  ON org_entitlements(org_id);
-- Hot path: "give me all active (non-expired) entitlements for this
-- feature_key for this org". Used on every limit check.
CREATE INDEX IF NOT EXISTS idx_org_entitlements_lookup
  ON org_entitlements(org_id, feature_key, expires_at);

ALTER TABLE org_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org read" ON org_entitlements;
CREATE POLICY "org read" ON org_entitlements FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );
-- Writes are admin-only (service-role).

-- =====================================================================
-- SUBSCRIPTIONS — add Stripe + cancellation columns to the table that
-- migration 017 created. Schema there had monthly_ai_tokens_limit +
-- tokens_used_this_month + billing_cycle_start; we're keeping all of
-- those (the token gate still works) and adding billing-state columns.
-- =====================================================================
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('trialing','active','past_due','canceling','canceled','incomplete','unpaid')),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_source TEXT,
  ADD COLUMN IF NOT EXISTS trial_extended_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_retention_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription
  ON subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
-- For the daily retention-purge cron in Session 3.
CREATE INDEX IF NOT EXISTS idx_subscriptions_retention
  ON subscriptions(data_retention_until)
  WHERE status = 'canceled' AND data_retention_until IS NOT NULL;

-- =====================================================================
-- HELPER: provision_bundle_entitlements
-- Atomically replaces all `bundle:<plan>` rows for an org with a fresh
-- set. Called from the Stripe webhook on checkout/upgrade/downgrade.
-- Per-org overrides (source = 'manual', 'custom_quote:*', 'promo:*')
-- are left untouched.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.provision_bundle_entitlements(
  p_org_id UUID,
  p_bundle_source TEXT,           -- e.g. 'bundle:pro'
  p_entitlements JSONB,            -- {"channels:max": "10", "feature:broadcasts": "true"}
  p_stripe_subscription_id TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_key TEXT;
  v_value TEXT;
BEGIN
  -- Wipe prior rows from this bundle source so a downgrade actually
  -- removes the old plan's higher limits.
  DELETE FROM org_entitlements
    WHERE org_id = p_org_id AND source = p_bundle_source;

  -- Insert fresh rows from the provided JSON.
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_entitlements)
  LOOP
    INSERT INTO org_entitlements (
      org_id, feature_key, value, source,
      expires_at, stripe_subscription_id
    ) VALUES (
      p_org_id, v_key, v_value, p_bundle_source,
      p_expires_at, p_stripe_subscription_id
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_bundle_entitlements(UUID, TEXT, JSONB, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_bundle_entitlements(UUID, TEXT, JSONB, TEXT, TIMESTAMPTZ) TO service_role;

NOTIFY pgrst, 'reload schema';
