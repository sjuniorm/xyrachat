-- =====================================================================
-- 057_bot_outcome_booking_created.sql — add 'booking_created' outcome.
--
-- The booking-objective bot can now actually create calendar events (via the
-- book_meeting tool). That's a stronger signal than the existing
-- 'booking_clicked' (a shared link), so it gets its own outcome type for the
-- bot's "Meetings booked" KPI. Idempotent: drop + re-add the CHECK.
-- =====================================================================

ALTER TABLE public.bot_outcomes DROP CONSTRAINT IF EXISTS bot_outcomes_type_check;
ALTER TABLE public.bot_outcomes ADD CONSTRAINT bot_outcomes_type_check CHECK (type IN (
  'lead_captured','link_clicked','booking_clicked','booking_created',
  'qualified','unqualified','handoff','resolved','fallback_no_knowledge'
));

NOTIFY pgrst, 'reload schema';
