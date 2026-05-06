-- Xyra Chat — fix: allow authenticated users to create their organization.
-- Week 1 onboarding flow inserts a row into organizations from the user's
-- session. The original 001 migration only granted SELECT on organizations,
-- so the insert failed with "new row violates row-level security policy".
--
-- This migration adds a guarded INSERT policy: any signed-in user MAY create
-- an organization, but only if their profile is not already linked to one.
-- The application also redirects users with an existing org_id away from
-- /onboarding, so this policy is a defence-in-depth check.

CREATE POLICY "users without an org can create one"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND org_id IS NOT NULL
        AND deleted_at IS NULL
    )
  );
