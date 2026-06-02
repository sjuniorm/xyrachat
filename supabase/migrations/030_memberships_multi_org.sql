-- Migration 030 — multi-org memberships + workspace switching
--
-- Model: the user's ACTIVE org stays `profiles.org_id` (so every existing
-- org-scoped RLS policy keeps working unchanged). `memberships` records which
-- orgs a user belongs to. "Switching workspace" = point profiles.org_id at
-- another org the user is a member of, via a membership-checked RPC.
--
-- SECURITY: today the "users can update own profile" policy lets a user change
-- their own `org_id` to ANY value → they'd gain access to that org's data.
-- This migration closes that hole: authenticated clients may no longer update
-- org_id/role directly; the only path is switch_active_org() (verifies
-- membership) or the service-role admin client.

-- =====================================================================
-- 1. memberships
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.memberships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'agent'
               CHECK (role IN ('owner', 'admin', 'supervisor', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS memberships_user_idx
  ON public.memberships (user_id) WHERE deleted_at IS NULL;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- A user sees only their own memberships. Writes happen exclusively through
-- the SECURITY DEFINER trigger/RPCs below (no client INSERT/UPDATE/DELETE
-- policy — so a user can't add themselves to an org).
DROP POLICY IF EXISTS "see own memberships" ON public.memberships;
CREATE POLICY "see own memberships" ON public.memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

GRANT ALL ON public.memberships TO service_role;
GRANT SELECT ON public.memberships TO authenticated;

-- =====================================================================
-- 2. Auto-create a membership whenever a profile's org_id is set/changed.
--    Covers onboarding (create_org_and_link), invited users
--    (handle_new_user), workspace creation, and switching — without
--    touching any of those functions individually.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ensure_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    INSERT INTO public.memberships (user_id, org_id, role)
    VALUES (NEW.id, NEW.org_id, COALESCE(NEW.role, 'agent'))
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_membership_trg ON public.profiles;
CREATE TRIGGER ensure_membership_trg
  AFTER INSERT OR UPDATE OF org_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_membership();

-- Backfill memberships for every existing profile that already has an org.
INSERT INTO public.memberships (user_id, org_id, role)
SELECT id, org_id, COALESCE(role, 'agent')
FROM public.profiles
WHERE org_id IS NOT NULL AND deleted_at IS NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

-- =====================================================================
-- 3. Let members read EVERY org they belong to (not just the active one),
--    so the workspace switcher can show their names.
-- =====================================================================
DROP POLICY IF EXISTS "org members can view org" ON public.organizations;
CREATE POLICY "org members can view org" ON public.organizations
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND id IN (
      SELECT org_id FROM public.memberships
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =====================================================================
-- 4. switch_active_org — the ONLY authenticated path to change org_id.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.switch_active_org(p_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.memberships
  WHERE user_id = auth.uid() AND org_id = p_org_id AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of that workspace';
  END IF;

  UPDATE public.profiles
  SET org_id = p_org_id, role = v_role
  WHERE id = auth.uid();

  RETURN p_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.switch_active_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.switch_active_org(UUID) TO authenticated, service_role;

-- =====================================================================
-- 5. create_additional_workspace — existing user spins up another org and
--    is switched into it as owner. Mirrors create_org_and_link but WITHOUT
--    the "already has an org" guard. Service-role only (called by the admin
--    client from a server action).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_additional_workspace(
  p_user_id UUID,
  p_name TEXT,
  p_slug TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  INSERT INTO organizations (name, slug)
  VALUES (p_name, p_slug)
  RETURNING id INTO v_org_id;

  -- Membership is created by the ensure_membership trigger when org_id is set.
  UPDATE profiles
  SET org_id = v_org_id, role = 'owner'
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  RETURN v_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_additional_workspace(UUID, TEXT, TEXT)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_additional_workspace(UUID, TEXT, TEXT)
  TO service_role;

-- =====================================================================
-- 6. Harden profiles: authenticated clients may update only safe self-edit
--    columns. org_id + role can no longer be set directly (only via
--    switch_active_org / the admin client). This closes the cross-tenant
--    self-reassignment hole. RLS row-scoping ("own profile") still applies.
-- =====================================================================
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, availability) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
