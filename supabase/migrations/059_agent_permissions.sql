-- =====================================================================
-- 059_agent_permissions.sql — owner-set constraints on the `agent` role.
--
-- A JSONB bag of toggles on the org. Empty {} = all defaults = today's
-- behaviour (so existing orgs are unchanged). Only the junior `agent` role is
-- constrained; owner/admin/supervisor are unaffected. Enforced app-side (an org
-- restricting its OWN members — RLS still hard-stops cross-org).
-- Keys (all optional): restrict_to_assigned (bool, default false),
-- can_delete_conversations / can_export / can_edit_contacts (bool, default true).
-- =====================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS agent_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
