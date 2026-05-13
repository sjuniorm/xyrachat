-- Xyra Chat — fix infinite-recursion bug introduced in migration 007.
--
-- The "org members visible" policy on profiles ran a SELECT FROM profiles
-- inside its USING clause. Postgres re-applies RLS to that subquery, hits
-- the same policy, and bails with:
--   "infinite recursion detected in policy for relation profiles"
-- That error short-circuits ALL profile reads from a user session — even
-- the user's own row via "users can view own profile" — because recursion
-- in ANY applicable policy poisons the whole evaluation.
--
-- The fix: move the "what's my org_id" lookup into a SECURITY DEFINER
-- helper that bypasses RLS, then have the policy reference the helper
-- instead of querying profiles directly. No more recursion.

-- =====================================================================
-- HELPER — returns the caller's org_id, bypassing RLS via SECURITY DEFINER.
-- STABLE so Postgres can cache the result within a single statement.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated, anon, service_role;

-- =====================================================================
-- REWRITTEN POLICY — uses the helper instead of a self-referencing subquery.
-- =====================================================================
DROP POLICY IF EXISTS "org members visible" ON profiles;
CREATE POLICY "org members visible" ON profiles
  FOR SELECT
  USING (
    org_id IS NOT NULL
    AND org_id = public.current_user_org_id()
    AND deleted_at IS NULL
  );

NOTIFY pgrst, 'reload schema';
