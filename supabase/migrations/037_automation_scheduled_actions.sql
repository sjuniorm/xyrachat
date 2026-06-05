-- =====================================================================
-- 037_automation_scheduled_actions.sql — delay / wait steps for automations.
--
-- A "wait" action used to log-and-skip. Now, when the executor hits one, it
-- persists the REMAINING actions here with a run_at, and stops. A per-minute
-- pg_cron job calls /api/internal/automation-runner, which resumes each due
-- row (re-running the remaining actions, which may schedule the next wait).
-- This unlocks timed follow-ups + drip flows.
--
-- Reuses the EXISTING app_config 'cron_secret' (migration 025) — no new
-- operator secret needed. Requires the http + pg_cron extensions (already
-- enabled for the webhook-retry + retention crons).
-- =====================================================================

CREATE TABLE IF NOT EXISTS automation_scheduled_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  remaining_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'cancelled')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The runner claims due rows by (status, run_at).
CREATE INDEX IF NOT EXISTS idx_autosched_due
  ON automation_scheduled_actions(status, run_at);

-- Service-role only — the executor + runner use the admin client; nothing
-- user-facing touches this table.
ALTER TABLE automation_scheduled_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON automation_scheduled_actions FROM PUBLIC, anon, authenticated;
GRANT ALL ON automation_scheduled_actions TO service_role;

-- =====================================================================
-- Per-minute runner — fires the Node endpoint that resumes due rows.
-- Mirrors process_webhook_retries (025) / trigger_retention_purge (027):
-- secret from app_config, prod URL hardcoded, fire-and-forget, bail when idle.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.process_automation_schedules()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url CONSTANT TEXT := 'https://xyra-chat.vercel.app/api/internal/automation-runner';
  v_secret TEXT;
BEGIN
  SELECT value INTO v_secret FROM app_config WHERE key = 'cron_secret';
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM automation_scheduled_actions
    WHERE status = 'pending' AND run_at <= NOW()
    LIMIT 1
  ) THEN
    RETURN 0;
  END IF;
  PERFORM http_post(
    v_url, '{}', 'application/json',
    ARRAY[http_header('Authorization', 'Bearer ' || v_secret)]
  );
  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_automation_schedules()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_automation_schedules() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process_automation_schedules') THEN
    PERFORM cron.unschedule('process_automation_schedules');
  END IF;
END $$;

SELECT cron.schedule(
  'process_automation_schedules',
  '* * * * *',
  $$ SELECT public.process_automation_schedules(); $$
);

NOTIFY pgrst, 'reload schema';
