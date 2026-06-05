-- =====================================================================
-- Migration 041 — per-channel bot schedule
--
-- bot_assignments.business_hours lets the SAME bot run on different schedules
-- per channel: e.g. on WhatsApp 9-5 Mon-Fri, but on Instagram 24/7. When NULL
-- (the default + every existing row) the bot gate falls back to the bot's own
-- bots.business_hours, so behavior is unchanged until an operator sets a
-- per-channel override in the Assign tab.
--
-- Shape mirrors bots.business_hours exactly (the gate's isWithinHours reads
-- both the same way):
--   { "active": true, "timezone": "Europe/Madrid",
--     "mon": [{"start":"09:00","end":"18:00"}], "tue": [...], ..., "sun": [] }
-- Empty array for a day = closed. active:false = ignore hours (24/7).
--
-- No new table → existing GRANTs + RLS on public.bot_assignments apply
-- (migration 036 granted service_role ALL + authenticated CRUD; RLS scopes
-- via bot→org). Writes go through the admin client in setAssignmentSchedule.
-- =====================================================================

ALTER TABLE public.bot_assignments
  ADD COLUMN IF NOT EXISTS business_hours JSONB;
