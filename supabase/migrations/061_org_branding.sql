-- =====================================================================
-- 061_org_branding.sql — white-label branding per org.
--
-- A JSONB bag on the org: brand_name, logo_url, accent_color, hide_powered_by.
-- ONLY applied when the org has the `feature:whitelabel` entitlement (today:
-- Infinite tier / custom deals) — the read helper gates on it, so a non-entitled
-- org always falls back to Xyra branding even if rows exist. Empty {} = Xyra
-- defaults. v1 applies to the customer-facing webchat widget; dashboard chrome +
-- custom domain are follow-ups (see _docs/white-label-design.md).
-- =====================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
