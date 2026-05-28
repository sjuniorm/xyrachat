-- Xyra Chat — Week 11 Session 2: webhook retry worker.
--
-- Drains the webhook_deliveries queue every minute. Uses pg_cron (already
-- enabled in migration 012) + the `http` extension to call our internal
-- /api/internal/webhook-retry endpoint, which contains the actual retry
-- logic in Node (HMAC signing, SSRF re-check, exponential backoff).
--
-- WHY we don't run the retry loop directly in SQL:
--   - HMAC signing needs Node crypto + pepper-controlled secrets.
--   - SSRF defense requires DNS resolution per delivery (Node's `dns`).
--   - The endpoint deduplicates webhook fan-out logic with lib/api/emit.
--
-- WHY pg_cron and not Vercel Cron:
--   - Hobby tier blocks sub-daily Vercel crons. We need 1/min cadence.
--   - pg_cron + http is free + already used for snooze-wake (migration 012).
--
-- The `http` extension must be ENABLED in Supabase's Database → Extensions
-- panel before this migration applies. We don't CREATE EXTENSION inside
-- the migration because Supabase requires it via the dashboard for audit.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http') THEN
    RAISE WARNING
      'http extension is not enabled — webhook retry cron will be installed but the call will fail until you enable it in Supabase Dashboard → Database → Extensions. Snooze-wake still works since it''s in-process.';
  END IF;
END $$;

-- Settings: the runner endpoint URL + CRON_SECRET. Stored as Postgres
-- settings so pg_cron can read them without us hardcoding production
-- URLs in this migration.
--
-- Set these once via Supabase SQL editor:
--   SELECT set_config('xyra.webhook_retry_url',
--                     'https://xyra-chat.vercel.app/api/internal/webhook-retry',
--                     false);
--   SELECT set_config('xyra.cron_secret', '<your CRON_SECRET>', false);

CREATE OR REPLACE FUNCTION public.process_webhook_retries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  -- Read config; bail quietly if not set (e.g. fresh migration before
  -- the operator wired up the values).
  BEGIN
    v_url := current_setting('xyra.webhook_retry_url', true);
    v_secret := current_setting('xyra.cron_secret', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN 0;
  END IF;

  -- Skip if no work to do — avoids burning a fetch every minute when
  -- nothing's pending.
  IF NOT EXISTS (
    SELECT 1 FROM webhook_deliveries
    WHERE status IN ('pending','retrying')
      AND next_retry_at <= NOW()
    LIMIT 1
  ) THEN
    RETURN 0;
  END IF;

  -- Fire and forget. We don't care about the response here — the Node
  -- endpoint updates the rows itself.
  PERFORM http_post(
    v_url,
    '{}',
    'application/json',
    ARRAY[
      http_header('Authorization', 'Bearer ' || v_secret)
    ]
  );
  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_webhook_retries()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_webhook_retries() TO service_role;

-- Schedule every minute. Idempotent: drop any prior schedule first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process_webhook_retries') THEN
    PERFORM cron.unschedule('process_webhook_retries');
  END IF;
END $$;

SELECT cron.schedule(
  'process_webhook_retries',
  '* * * * *',
  $$ SELECT public.process_webhook_retries(); $$
);

NOTIFY pgrst, 'reload schema';
