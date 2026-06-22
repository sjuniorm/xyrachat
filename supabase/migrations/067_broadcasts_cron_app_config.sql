-- =====================================================================
-- 067_broadcasts_cron_app_config.sql
--
-- Fix 065: it read config via current_setting('xyra.*'), which needs
-- ALTER DATABASE ... SET — and Supabase's restricted postgres role can't do
-- that (ERROR 42501: permission denied to set parameter). Migration 025 already
-- solved this for the webhook-retry cron with the `app_config` table; do the
-- same here. The URL is hardcoded (prod endpoint), and the bearer secret is read
-- from app_config under the SAME key ('cron_secret') the other crons use — so if
-- you've already set it for webhook-retry/retention, broadcasts works with NO
-- extra step.
--
-- Idempotent (CREATE OR REPLACE + re-assert the schedule).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.process_scheduled_broadcasts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url CONSTANT TEXT := 'https://app.xyrachat.com/api/cron/broadcasts';
  v_secret TEXT;
BEGIN
  SELECT value INTO v_secret FROM app_config WHERE key = 'cron_secret';
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN 0;
  END IF;

  -- Only fire when there's a broadcast due now OR one stuck in 'sending' the
  -- route's sweeper should re-queue. Avoids a needless call every 5 min.
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

  -- Fire and forget — /api/cron/broadcasts claims + dispatches each broadcast.
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

-- Re-assert the every-5-min schedule (065 already created it; idempotent).
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

-- After applying, set the shared cron secret ONCE (skip if already set for the
-- other crons — check with `SELECT key FROM app_config;`):
--
--   INSERT INTO app_config (key, value, description)
--   VALUES ('cron_secret', '<paste CRON_SECRET from Vercel>',
--           'Bearer token for /api/cron/* + /api/internal/*')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

NOTIFY pgrst, 'reload schema';
