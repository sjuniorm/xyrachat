-- Xyra Chat — Vault wrappers
--
-- Supabase Vault lives in the `vault` schema. PostgREST only exposes the
-- `public` schema by default, so calling `supabase.rpc("create_secret")`
-- without these wrappers fails with:
--   "Could not find the function public.create_secret … in the schema cache"
--
-- The fix used by Supabase's own docs: create SECURITY DEFINER wrappers in
-- `public` that forward to the `vault` functions, and lock execute permission
-- to `service_role` only so the wrappers can't be called by anon/authenticated
-- clients.

CREATE OR REPLACE FUNCTION public.create_secret(
  new_secret TEXT,
  new_name TEXT,
  new_description TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  secret_id UUID;
BEGIN
  SELECT vault.create_secret(new_secret, new_name, new_description) INTO secret_id;
  RETURN secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_secret(
  secret_id UUID,
  new_secret TEXT,
  new_name TEXT DEFAULT NULL,
  new_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  PERFORM vault.update_secret(secret_id, new_secret, new_name, new_description);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_secret(secret_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  result TEXT;
BEGIN
  SELECT decrypted_secret INTO result
  FROM vault.decrypted_secrets
  WHERE id = secret_id;
  RETURN result;
END;
$$;

-- Lock down execution: service_role only. Even with PostgREST exposing public,
-- anon/authenticated callers get permission denied.
REVOKE EXECUTE ON FUNCTION public.create_secret(TEXT, TEXT, TEXT)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_secret(UUID, TEXT, TEXT, TEXT)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_secret(UUID)
  FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_secret(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_secret(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_secret(UUID) TO service_role;

-- Force PostgREST to reload its schema cache so the new functions are visible
-- immediately (no need to wait the default ~10 minutes).
NOTIFY pgrst, 'reload schema';
