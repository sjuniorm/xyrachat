-- =====================================================================
-- 038_automation_wait_for_reply.sql — pause an automation until the contact
-- replies (then branch on the answer).
--
-- A "wait_for_reply" step persists the remaining actions like a timed wait,
-- but resume_on='reply': the next inbound from that conversation resumes it
-- (the reply text is injected as message_text so a following if/else can
-- branch on it). run_at doubles as the TIMEOUT deadline — if no reply arrives
-- by then, the per-minute runner resumes the flow with a "timed out" marker so
-- it can take a no-reply path. No new table or cron — reuses 037.
-- =====================================================================

ALTER TABLE public.automation_scheduled_actions
  ADD COLUMN IF NOT EXISTS resume_on TEXT NOT NULL DEFAULT 'timer'
    CHECK (resume_on IN ('timer', 'reply'));

-- Fast lookup of reply-waiting rows for a conversation when an inbound lands.
CREATE INDEX IF NOT EXISTS idx_autosched_reply_wait
  ON public.automation_scheduled_actions (conversation_id, status)
  WHERE resume_on = 'reply';

NOTIFY pgrst, 'reload schema';
