-- =====================================================================
-- 055_org_addons.sql — purchased add-ons per org (Edge/Prime extras).
--
-- An org on an add-on-eligible pack can buy extras (extra users/channels/
-- chatbots/AI-tokens, or unlock integrations/broadcasts). Each purchase is a
-- Stripe subscription ITEM on the org's existing subscription; this table is
-- the local mirror that drives the billing UI + the entitlement recompute.
--
-- Entitlements themselves live in org_entitlements with source `addon:<id>`
-- (written by lib/billing/addon-provision.ts) — for quantity add-ons the value
-- is base + qty×perUnit, so the existing "most-permissive-wins" resolver picks
-- it up with no engine change.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.org_addons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  addon_id     text NOT NULL,            -- matches AddonId in lib/billing/addons.ts
  quantity     integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  stripe_subscription_item_id text,      -- the Stripe sub-item; null if unset
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'canceled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

-- One live row per (org, add-on type); quantity holds the count.
CREATE UNIQUE INDEX IF NOT EXISTS org_addons_unique_active
  ON public.org_addons (org_id, addon_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS org_addons_org_idx
  ON public.org_addons (org_id) WHERE deleted_at IS NULL;

ALTER TABLE public.org_addons ENABLE ROW LEVEL SECURITY;

-- Org members READ their add-ons (billing UI). Writes go through the
-- service-role admin client in the owner-checked server actions + webhook.
DROP POLICY IF EXISTS "org read addons" ON public.org_addons;
CREATE POLICY "org read addons" ON public.org_addons
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

GRANT ALL ON public.org_addons TO service_role;
GRANT SELECT ON public.org_addons TO authenticated;

NOTIFY pgrst, 'reload schema';
