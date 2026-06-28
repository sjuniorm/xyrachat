-- 069_active_views_security_invoker.sql
--
-- Fix the Supabase "Security Definer View" advisor warnings on the *_active
-- convenience views (organizations_active, profiles_active, channels_active,
-- contacts_active, conversations_active, messages_active, wa_templates_active,
-- broadcasts_active, … — every public view whose name ends in `_active`).
--
-- A view defaults to SECURITY DEFINER semantics (security_invoker = off), so it
-- runs with the view OWNER's privileges and can bypass the underlying tables'
-- RLS. Setting security_invoker = on makes the view run with the QUERYING user's
-- privileges, so RLS is enforced exactly as on the base tables — no cross-tenant
-- read via a direct view query.
--
-- Safe: the app queries the base tables (not these views), and service_role
-- (the admin client) bypasses RLS regardless, so this only tightens behavior for
-- direct API queries by authenticated/anon. Idempotent.
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname LIKE '%\_active'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v.relname);
  END LOOP;
END $$;
