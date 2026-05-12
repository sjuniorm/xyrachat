-- Xyra Chat — Week 4: team management foundation
--
-- Adds: snooze_until on conversations, availability on profiles, RLS so org
-- peers can see each other, and updates handle_new_user() to honour invite
-- metadata so users invited via supabase.auth.admin.inviteUserByEmail land
-- in the right org with the right role automatically.

-- =====================================================================
-- COLUMNS
-- =====================================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT 'online'
  CHECK (availability IN ('online', 'away', 'offline'));

CREATE INDEX IF NOT EXISTS idx_profiles_org_id
  ON profiles(org_id) WHERE deleted_at IS NULL;

-- =====================================================================
-- RLS — org peers visible to each other
-- Current policy only let users see their OWN profile, which blocks the
-- assignment dropdown / team list. Add a second SELECT policy (PERMISSIVE
-- policies OR, so the existing "users can view own profile" still works).
-- =====================================================================
DROP POLICY IF EXISTS "org members visible" ON profiles;
CREATE POLICY "org members visible" ON profiles
  FOR SELECT
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT p2.org_id FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- =====================================================================
-- UPDATE handle_new_user — honour invite metadata
-- Supabase invites carry our `data` payload in raw_user_meta_data. When
-- present, link the new profile to the inviter's org with the chosen role.
-- =====================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invited_org UUID;
  invited_role TEXT;
BEGIN
  invited_org := NULLIF(NEW.raw_user_meta_data->>'invited_org_id', '')::UUID;
  invited_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'invited_role', ''), 'agent');
  -- Reject invalid roles silently — fall back to 'agent'.
  IF invited_role NOT IN ('owner', 'admin', 'agent') THEN
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

-- Realtime broadcast for profiles too — agent presence changes should show
-- up in other tabs without a refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
END $$;

ALTER TABLE profiles REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
