-- =====================================================================
-- Migration 044 — trial-end reminder (security audit, item 3)
--
-- Trials are APP-MANAGED (subscriptions.trial_ends_at; auto-provisioned on
-- signup + bumped by promo codes), NOT Stripe trial_period_days — so Stripe's
-- customer.subscription.trial_will_end rarely fires. This daily cron sends the
-- branded "your trial ends in N days" email before the trial converts.
-- (The Stripe trial_will_end webhook is ALSO wired, for any future
-- Stripe-managed trials — they won't double-fire since app trials have no
-- Stripe subscription.)
--
-- trial_reminder_sent_at de-dupes so each org is reminded once per trial.
-- Same app_config cron_secret + http_post pattern as migrations 024/027.
-- =====================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.trigger_trial_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url CONSTANT TEXT := 'https://xyra-chat.vercel.app/api/internal/trial-reminders';
  v_secret TEXT;
BEGIN
  SELECT value INTO v_secret FROM app_config WHERE key = 'cron_secret';
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN 0;
  END IF;
  -- Only fire if a trial is actually due (avoids a daily no-op fetch).
  IF NOT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE trial_ends_at IS NOT NULL
      AND trial_ends_at > NOW()
      AND trial_ends_at <= NOW() + INTERVAL '3 days'
      AND trial_reminder_sent_at IS NULL
      AND stripe_subscription_id IS NULL
      AND status <> 'canceled'
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

REVOKE EXECUTE ON FUNCTION public.trigger_trial_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_trial_reminders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trial_reminders') THEN
    PERFORM cron.unschedule('trial_reminders');
  END IF;
END $$;

-- Daily at 08:37 UTC (morning EU, off the top-of-hour stampede).
SELECT cron.schedule('trial_reminders', '37 8 * * *',
  $$ SELECT public.trigger_trial_reminders(); $$);
