-- Xyra Chat — Realtime reliability
--
-- Supabase Realtime evaluates RLS for each subscriber before delivering an
-- event. Our messages RLS policy has a nested subquery (conversation_id IN
-- (SELECT id FROM conversations WHERE org_id IN (SELECT … FROM profiles))).
-- For that to evaluate reliably during Realtime broadcast, the table needs
-- REPLICA IDENTITY FULL so the full row is available to the policy.
--
-- Idempotent — safe to re-run.

ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;

-- Force PostgREST + Realtime to reload state so the new replica identity is
-- picked up without waiting for the next process restart.
NOTIFY pgrst, 'reload schema';
