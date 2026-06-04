-- =====================================================================
-- 034_bot_tools_config.sql — per-bot tool-use (function calling) config.
--
-- Adds a single additive JSONB column. Shape:
--   { "capture_lead": {"enabled": true},
--     "tag_contact": {"enabled": true},
--     "request_human_handoff": {"enabled": true},
--     "search_knowledge": {"enabled": false} }
-- Default '{}' = no tools, so EXISTING bots keep their current single-call
-- behavior (zero regression). New bots get sensible per-objective defaults
-- seeded by createBot in app code.
--
-- No new tables: capture_lead → contacts.name/email/phone + contacts.tags,
-- tag_contact → contacts.tags, request_human_handoff → conversations.status
-- (handled by the existing handoff path), provenance → bot_outcomes
-- (existing 'lead_captured'/'handoff' enum values — the CHECK is untouched)
-- + messages.metadata.tools_invoked.
-- =====================================================================
ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS tools_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Re-affirm grants (idempotent; per the post-2026-10-30 Data-API convention).
GRANT ALL ON public.bots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bots TO authenticated;
