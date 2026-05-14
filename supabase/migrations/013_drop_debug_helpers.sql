-- Xyra Chat — drop the debug helper added during the Week 4 RLS-recursion hunt.
--
-- 009_debug_auth_uid.sql created public.debug_auth_uid() and an /api/debug/whoami
-- route to diagnose why org_id reads were silently failing for the user-scoped
-- client. Migration 010 fixed the underlying RLS recursion. With that solved,
-- the helper is dead weight — and a SECURITY DEFINER returning auth.uid() with
-- no narrower purpose is the kind of thing that should not live in prod.

DROP FUNCTION IF EXISTS public.debug_auth_uid();

NOTIFY pgrst, 'reload schema';
