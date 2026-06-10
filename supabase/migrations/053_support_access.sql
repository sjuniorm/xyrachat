-- =====================================================================
-- 053_support_access.sql — client-granted, time-boxed support access.
--
-- A workspace owner/admin can let Xyra Support into their workspace to help
-- (reproduce an issue, see their setup) — but ONLY with explicit, time-boxed,
-- revocable, audited consent. This migration ships the CONSENT primitive:
--   * support_grants     — the live consent record (one active per org)
--   * support_access_log — append-only audit trail (granted/revoked/…)
-- The "enter workspace" step (a temporary scoped membership for the support
-- user) is a separate, guarded follow-up — see _docs/support-access-design.md.
-- Nothing here grants any cross-tenant read by itself; it only records consent
-- that operator-side code must check before assisting.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.support_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  scope       text NOT NULL DEFAULT 'read_reply'
                CHECK (scope IN ('read_only', 'read_reply')),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- At most one non-revoked grant per org (re-granting revokes the prior row
-- first, app-side). Expired-but-not-revoked rows still count as the live row
-- until replaced; queries gate on expires_at > now().
CREATE UNIQUE INDEX IF NOT EXISTS support_grants_active_idx
  ON public.support_grants (org_id) WHERE revoked_at IS NULL;

ALTER TABLE public.support_grants ENABLE ROW LEVEL SECURITY;

-- Org members READ their org's grant (drives the consent card + the live
-- "Support can access until …" banner). All WRITES go through the service-role
-- admin client inside role-checked server actions — never client-direct.
DROP POLICY IF EXISTS "org read support grant" ON public.support_grants;
CREATE POLICY "org read support grant" ON public.support_grants
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

GRANT ALL ON public.support_grants TO service_role;
GRANT SELECT ON public.support_grants TO authenticated;

-- Append-only audit trail. Service-role writes; org members read their own
-- org's history (transparency — clients can see exactly when support was in).
CREATE TABLE IF NOT EXISTS public.support_access_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  support_user uuid,                 -- the operator-side user, when applicable
  actor        uuid,                 -- who performed the action (client admin / support)
  action       text NOT NULL
                 CHECK (action IN ('granted', 'revoked', 'expired', 'entered', 'exited', 'action')),
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_access_log_org_idx
  ON public.support_access_log (org_id, created_at DESC);

ALTER TABLE public.support_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org read support log" ON public.support_access_log;
CREATE POLICY "org read support log" ON public.support_access_log
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

GRANT ALL ON public.support_access_log TO service_role;
GRANT SELECT ON public.support_access_log TO authenticated;

NOTIFY pgrst, 'reload schema';
