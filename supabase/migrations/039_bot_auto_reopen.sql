-- =====================================================================
-- 039_bot_auto_reopen.sql — per-bot "auto-reopen closed chats" toggle.
--
-- When on, a new inbound on a CLOSED conversation reopens it (status='open')
-- so the bot picks the thread back up, instead of the inbound being ignored.
-- Off by default (preserves current behavior: closed stays closed).
-- =====================================================================
ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS auto_reopen_closed BOOLEAN NOT NULL DEFAULT false;

-- Reaffirm grants (idempotent; post-2026-10-30 Data-API convention).
GRANT ALL ON public.bots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bots TO authenticated;
