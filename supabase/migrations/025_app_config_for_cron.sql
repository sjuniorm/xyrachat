-- Xyra Chat — fix Week 11 Session 2 webhook-retry cron config.
--
-- Migration 024 stored its config via `ALTER DATABASE ... SET xyra.*`,
-- but Supabase's `postgres` role is a restricted superuser and cannot
-- set custom GUC parameters via ALTER DATABASE — it errors with
-- `42501: permission denied to set parameter "xyra.webhook_retry_url"`.
--
-- This migration introduces a tiny `app_config` table that the cron
-- function reads from instead. Service-role-only; nothing in the app
-- writes to it from user-facing code, so RLS gives anon/authenticated
-- no rows even if grants leaked.
--
-- The runtime URL is hardcoded into the function — production endpoint
-- doesn't change unless we move domains. Only the secret needs to live
-- in the config table.

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON app_config TO service_role;
-- No SELECT/UPDATE policy for client roles → table is invisible to them.

-- Rewrite the function. Hardcode the prod URL; read the secret from
-- app_config so it never lives in this migration file (which is public).
CREATE OR REPLACE FUNCTION public.process_webhook_retries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url CONSTANT TEXT := 'https://xyra-chat.vercel.app/api/internal/webhook-retry';
  v_secret TEXT;
BEGIN
  SELECT value INTO v_secret FROM app_config WHERE key = 'cron_secret';
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN 0;
  END IF;

  -- Bail when there's no work — avoids a fetch every minute when idle.
  IF NOT EXISTS (
    SELECT 1 FROM webhook_deliveries
    WHERE status IN ('pending','retrying')
      AND next_retry_at <= NOW()
    LIMIT 1
  ) THEN
    RETURN 0;
  END IF;

  -- Fire and forget; the endpoint updates row state.
  PERFORM http_post(
    v_url,
    '{}',
    'application/json',
    ARRAY[http_header('Authorization', 'Bearer ' || v_secret)]
  );
  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_webhook_retries()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_webhook_retries() TO service_role;

-- After this migration applies, run ONE INSERT to set the secret:
--
--   INSERT INTO app_config (key, value, description)
--   VALUES ('cron_secret', '<paste CRON_SECRET from .env.local>',
--           'Bearer token for /api/internal/* + /api/cron/*')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
--                                   updated_at = NOW();
--
-- Verify with:  SELECT key, length(value) AS chars FROM app_config;
-- (Don't SELECT the value in plaintext — Supabase SQL editor logs queries.)

NOTIFY pgrst, 'reload schema';
