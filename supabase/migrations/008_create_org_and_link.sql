-- Xyra Chat — atomic org creation
--
-- The previous createOrgAction did INSERT INTO organizations then UPDATE
-- profiles in two separate Postgres calls. If the UPDATE silently matched
-- 0 rows (auth uid drift, missing profile, anything), the INSERT left an
-- orphan org and the user got stuck bouncing between /onboarding and
-- /dashboard. Wrapping both in a SECURITY DEFINER function makes it one
-- transaction — either both happen or neither does.
--
-- Bonus: also ensures the profile row exists (defensive INSERT … ON
-- CONFLICT) in case the handle_new_user trigger missed.

CREATE OR REPLACE FUNCTION public.create_org_and_link(
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
  v_email TEXT;
BEGIN
  -- 1. Make sure a profile row exists for this user. If the trigger fired,
  --    this is a no-op. If it somehow didn't (rare), we backfill here.
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No auth.users row for user %', p_user_id;
  END IF;
  INSERT INTO profiles (id, email, role)
  VALUES (p_user_id, v_email, 'agent')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Guard against double-onboarding races.
  PERFORM 1 FROM profiles
  WHERE id = p_user_id AND org_id IS NOT NULL AND deleted_at IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'User already has an org';
  END IF;

  -- 3. Create the org.
  INSERT INTO organizations (name, slug)
  VALUES (p_name, p_slug)
  RETURNING id INTO v_org_id;

  -- 4. Link the profile. Same transaction — if this UPDATE somehow matches
  --    zero rows, we raise and the entire INSERT above rolls back.
  UPDATE profiles
  SET org_id = v_org_id, role = 'owner'
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile update matched 0 rows for user %', p_user_id;
  END IF;

  RETURN v_org_id;
END;
$$;

-- Service-role only — never callable by anon / authenticated clients.
REVOKE EXECUTE ON FUNCTION public.create_org_and_link(UUID, TEXT, TEXT)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_org_and_link(UUID, TEXT, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
