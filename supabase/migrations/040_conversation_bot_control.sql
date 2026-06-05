-- =====================================================================
-- Migration 040 — per-conversation bot control
--
-- Two independent per-conversation knobs, both surfaced in the inbox
-- StatusMenu:
--
--   bot_only        When true, this conversation is a fully-automated funnel:
--                   the human reply composer is hidden in the inbox, and the
--                   bot gate keeps responding even if the chat was previously
--                   assigned to an agent or a human replied recently (it
--                   bypasses Gate 2 auto-pause + Gate 3's assigned check).
--                   Closed/snoozed status is still respected.
--
--   bot_id_override Pin a specific bot to THIS conversation, bypassing the
--                   channel's intent routing (migration 036). Nullable —
--                   when unset the gate falls back to channel assignment +
--                   the Haiku router. ON DELETE SET NULL so a hard bot delete
--                   clears the pin; soft-deleted/inactive bots are already
--                   ignored by the gate's active + deleted_at filter, which
--                   then falls back to normal routing.
--
-- No new table → the existing GRANTs + RLS on public.conversations cover
-- these columns (column adds inherit table-level policy + privileges). The
-- user-scoped client reads them via `select *`; all writes go through the
-- admin client in org-scoped server actions (lib/inbox/actions.ts).
-- =====================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS bot_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_id_override UUID
    REFERENCES public.bots(id) ON DELETE SET NULL;

-- Index the FK referencing side so a (rare) HARD bot delete doesn't seq-scan
-- conversations to apply ON DELETE SET NULL. Partial: only the pinned rows.
CREATE INDEX IF NOT EXISTS idx_conversations_bot_id_override
  ON public.conversations (bot_id_override)
  WHERE bot_id_override IS NOT NULL;
