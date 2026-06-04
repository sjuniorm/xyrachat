-- =====================================================================
-- 036_multi_bot_routing.sql — multiple bots per channel + intent routing.
--
-- Until now bot_assignments had UNIQUE(channel_id): exactly one bot per
-- channel. This lets a workspace put e.g. a Sales bot AND a Support bot on the
-- same channel; the bot gate runs a cheap Haiku classifier on the inbound to
-- pick which one handles the conversation, then sticks with it (sticky routing
-- via conversations.routed_bot_id) so the chat doesn't bounce between bots.
--
-- Backward compatible: a channel with a single assigned bot skips the
-- classifier entirely (zero added cost + identical behavior).
-- =====================================================================

-- Drop the one-bot-per-channel constraint (auto-named from the inline
-- UNIQUE(channel_id) in migration 016).
ALTER TABLE public.bot_assignments
  DROP CONSTRAINT IF EXISTS bot_assignments_channel_id_key;

-- A bot still can't be assigned to the same channel twice, but different bots
-- may share a channel.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_assignments_channel_bot_key'
  ) THEN
    ALTER TABLE public.bot_assignments
      ADD CONSTRAINT bot_assignments_channel_bot_key UNIQUE (channel_id, bot_id);
  END IF;
END $$;

-- Per-assignment routing hint the classifier uses ("handle pricing + sales
-- questions"). Channel-specific, so the same bot can route differently per
-- channel.
ALTER TABLE public.bot_assignments
  ADD COLUMN IF NOT EXISTS routing_description TEXT;

-- Sticky routing: which bot this conversation was routed to. NULL = not yet
-- routed (or single-bot channel). The FK is ON DELETE SET NULL, but that only
-- fires on a HARD delete of a bots row — our UI paths (unassign via
-- setChannelAssignment(false) and deleteBot's soft-delete) leave the pointer
-- intact. That is harmless: the gate only honors routed_bot_id when the bot is
-- still an ACTIVE candidate for the channel, otherwise it re-classifies. So
-- the SET NULL is just belt-and-suspenders for the rare hard-delete case.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS routed_bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL;

-- Reaffirm grants (idempotent; per the post-2026-10-30 Data-API convention).
GRANT ALL ON public.bot_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_assignments TO authenticated;
GRANT ALL ON public.conversations TO service_role;

NOTIFY pgrst, 'reload schema';
