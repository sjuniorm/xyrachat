-- =====================================================================
-- 065_broadcasts_cron.sql — schedule scheduled-broadcast dispatch via pg_cron.
--
-- The §15 audit found scheduled broadcasts had NO scheduler. A vercel.json
-- cron was tried but the Vercel **Hobby** tier blocks sub-daily crons, which
-- BROKE deploys ("Hobby accounts are limited to daily cron jobs"). So we use
-- pg_cron + the `http` extension — same pattern as webhook-retry (024),
-- sequences (047), retention-purge (027) — which is free + works on any
-- Vercel plan and fires every 5 minutes.
--
-- The `http` extension must be ENABLED in Supabase → Database → Extensions.
-- And the operator must set these once (default DB name on Supabase is
-- `postgres`):
--
--   ALTER DATABASE postgres
--     SET xyra.broadcasts_cron_url = 'https://app.xyrachat.com/api/cron/broadcasts';
--   ALTER DATABASE postgres
--     SET xyra.cron_secret = '<your CRON_SECRET>';   -- (already set for 024)
--
-- Verify:  SHOW xyra.broadcasts_cron_url;  SHOW xyra.cron_secret;
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http') THEN
    RAISE WARNING
      'http extension is not enabled — the broadcasts cron is installed but the call will fail until you enable it in Supabase Dashboard → Database → Extensions.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_scheduled_broadcasts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  BEGIN
    v_url := current_setting('xyra.broadcasts_cron_url', true);
    v_secret := current_setting('xyra.cron_secret', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN 0;
  END IF;

  -- Skip the fetch unless there's a broadcast due now OR one stuck in
  -- 'sending' the route's sweeper should re-queue. Avoids a needless call
  -- every 5 min when nothing is scheduled.
  IF NOT EXISTS (
    SELECT 1 FROM broadcasts
    WHERE deleted_at IS NULL
      AND (
        (status = 'scheduled' AND scheduled_at <= NOW())
        OR (status = 'sending' AND started_at < NOW() - INTERVAL '15 minutes')
      )
    LIMIT 1
  ) THEN
    RETURN 0;
  END IF;

  -- Fire and forget — the Node endpoint (/api/cron/broadcasts) claims +
  -- dispatches each due broadcast and reaps stuck ones.
  PERFORM http_post(
    v_url,
    '{}',
    'application/json',
    ARRAY[ http_header('Authorization', 'Bearer ' || v_secret) ]
  );
  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_scheduled_broadcasts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_scheduled_broadcasts() TO service_role;

-- Schedule every 5 minutes. Idempotent: drop any prior schedule first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process_scheduled_broadcasts') THEN
    PERFORM cron.unschedule('process_scheduled_broadcasts');
  END IF;
END $$;

SELECT cron.schedule(
  'process_scheduled_broadcasts',
  '*/5 * * * *',
  $$ SELECT public.process_scheduled_broadcasts(); $$
);

NOTIFY pgrst, 'reload schema';
