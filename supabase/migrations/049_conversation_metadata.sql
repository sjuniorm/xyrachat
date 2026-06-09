-- =====================================================================
-- 049_conversation_metadata.sql — freeform metadata on conversations.
--
-- Backs AI conversation summaries + auto-tagging (and future per-conversation
-- bits). JSONB so we don't migrate per field. Example shape:
--   { "summary": "...", "summary_at": "<iso>",
--     "suggested_tags": ["billing","refund"] }
-- Existing table → existing grants/RLS apply; no new GRANTs needed.
-- =====================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
