-- =====================================================================
-- 063_handle_new_user_supervisor.sql
--
-- Fix role drift: migration 011 added 'supervisor' to the profiles role
-- CHECK constraint and lib/team/actions.ts lets owners/admins invite a
-- brand-new email AS a supervisor (raw_user_meta_data.invited_role =
-- 'supervisor'). But handle_new_user() — last defined in 007, before
-- supervisor existed — still only whitelists owner/admin/agent and silently
-- downgrades anything else to 'agent'. So inviting a NEW email as a
-- supervisor created an agent instead (and the ensure_membership trigger then
-- derived an 'agent' membership from the wrong profile role). The
-- already-has-an-account invite path uses memberships directly and was never
-- affected.
--
-- This re-defines the function to include 'supervisor' in the valid set.
-- Idempotent (CREATE OR REPLACE). No backfill needed beyond optionally
-- correcting any already-mis-provisioned supervisors by hand.
-- =====================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invited_org UUID;
  invited_role TEXT;
BEGIN
  invited_org := NULLIF(NEW.raw_user_meta_data->>'invited_org_id', '')::UUID;
  invited_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'invited_role', ''), 'agent');
  -- Reject invalid roles silently — fall back to 'agent'. 'supervisor' is a
  -- valid role since migration 011 and must be honoured here.
  IF invited_role NOT IN ('owner', 'admin', 'supervisor', 'agent') THEN
    invited_role := 'agent';
  END IF;

  INSERT INTO profiles (id, email, full_name, org_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    invited_org,
    CASE WHEN invited_org IS NOT NULL THEN invited_role ELSE 'agent' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
