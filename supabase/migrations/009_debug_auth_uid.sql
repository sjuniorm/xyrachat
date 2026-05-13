-- Xyra Chat — temporary diagnostic: expose auth.uid() to authenticated clients.
-- Used once to confirm whether the JWT cookie is being forwarded to Postgres
-- correctly. Remove (DROP FUNCTION) after Week 4 debugging is done.

CREATE OR REPLACE FUNCTION public.debug_auth_uid()
RETURNS TABLE(uid UUID)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.debug_auth_uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_auth_uid() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
