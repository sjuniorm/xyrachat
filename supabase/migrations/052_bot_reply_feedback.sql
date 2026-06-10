-- =====================================================================
-- 052_bot_reply_feedback.sql — 👍 / 👎 on individual bot replies.
--
-- Agents rate the AI's automated replies straight from the inbox bubble.
-- One rating per (message, agent) — re-rating updates in place; clicking the
-- same thumb again clears it (handled app-side via delete). Feeds the bot's
-- Overview tab (quality signal) and is the raw material for future
-- prompt/knowledge tuning.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.bot_reply_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id      uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  bot_id          uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  rating          text NOT NULL CHECK (rating IN ('up', 'down')),
  reason          text,
  created_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- One live rating per agent per bot reply (re-rating UPSERTs onto this).
CREATE UNIQUE INDEX IF NOT EXISTS bot_reply_feedback_msg_user_idx
  ON public.bot_reply_feedback (message_id, created_by)
  WHERE deleted_at IS NULL;
-- Bot Overview aggregate: count up/down per bot.
CREATE INDEX IF NOT EXISTS bot_reply_feedback_bot_idx
  ON public.bot_reply_feedback (bot_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS bot_reply_feedback_conv_idx
  ON public.bot_reply_feedback (conversation_id) WHERE deleted_at IS NULL;

ALTER TABLE public.bot_reply_feedback ENABLE ROW LEVEL SECURITY;

-- Org members read their org's feedback (inbox shows my rating; bot dashboard
-- shows the aggregate). Insert/update/delete only your OWN rows, in your org.
DROP POLICY IF EXISTS "org read feedback" ON public.bot_reply_feedback;
CREATE POLICY "org read feedback" ON public.bot_reply_feedback
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "own feedback insert" ON public.bot_reply_feedback;
CREATE POLICY "own feedback insert" ON public.bot_reply_feedback
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "own feedback update" ON public.bot_reply_feedback;
CREATE POLICY "own feedback update" ON public.bot_reply_feedback
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

GRANT ALL ON public.bot_reply_feedback TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.bot_reply_feedback TO authenticated;

NOTIFY pgrst, 'reload schema';
