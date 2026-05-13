-- Xyra Chat — scheduled wake for snoozed conversations.
--
-- The app-side wakeSnoozedConversations() call in lib/inbox/server.ts runs
-- on every inbox fetch, so as soon as anyone visits the inbox the row
-- flips back to 'open'. That's enough most of the time. But if no one
-- visits for hours after a 30-min snooze, the row stays snoozed in
-- between — Realtime never fires, agents miss the wake.
--
-- This migration adds:
--   1. A SECURITY DEFINER function that does the wake UPDATE
--   2. A pg_cron job calling it every minute
--
-- Requires Supabase's pg_cron extension. It's pre-installed on every
-- Supabase project but disabled by default — we enable it here.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.wake_snoozed_conversations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_woken INTEGER;
BEGIN
  UPDATE conversations
  SET status = 'open',
      snooze_until = NULL
  WHERE status = 'snoozed'
    AND snooze_until IS NOT NULL
    AND snooze_until <= NOW();
  GET DIAGNOSTICS v_woken = ROW_COUNT;
  RETURN v_woken;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wake_snoozed_conversations()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wake_snoozed_conversations() TO service_role;

-- Drop any prior schedule so re-running this migration is idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'wake_snoozed_conversations'
  ) THEN
    PERFORM cron.unschedule('wake_snoozed_conversations');
  END IF;
END $$;

-- Run every minute.
SELECT cron.schedule(
  'wake_snoozed_conversations',
  '* * * * *',
  $$ SELECT public.wake_snoozed_conversations(); $$
);

NOTIFY pgrst, 'reload schema';
