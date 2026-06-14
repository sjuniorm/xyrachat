-- =====================================================================
-- 054_bot_feedback_notifications.sql — dedupe for support-feedback emails.
--
-- When an agent adds a "what went wrong" note to a 👎 on a bot reply, we email
-- the Xyra support inbox ONCE. The original dedupe inferred "already emailed"
-- from the editable bot_reply_feedback.reason, which an agent could reset
-- (clear-then-re-add, or toggle the 👎 off/on → the row is soft-deleted and a
-- fresh one inserted) to re-fire the email in a loop = inbox spam + Resend cost.
--
-- This table is the durable, churn-proof claim: PRIMARY KEY (message_id) gives
-- an atomic one-row-per-bot-reply guarantee via INSERT ... ON CONFLICT DO
-- NOTHING. We only send the email when our insert actually claimed the row.
-- Survives feedback-row deletes/re-inserts because it's keyed on the immutable
-- message id, not the feedback row.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.bot_feedback_notifications (
  message_id  uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_feedback_notifications_org_idx
  ON public.bot_feedback_notifications (org_id);

-- Service-role only: written/read exclusively by the server-side feedback
-- action via the admin client. No client ever touches it. RLS on with no
-- policies = deny-all to anon/authenticated (service_role bypasses RLS).
ALTER TABLE public.bot_feedback_notifications ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.bot_feedback_notifications TO service_role;

NOTIFY pgrst, 'reload schema';
