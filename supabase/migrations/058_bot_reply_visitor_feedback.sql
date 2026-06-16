-- =====================================================================
-- 058_bot_reply_visitor_feedback.sql — END-CUSTOMER 👍/👎 on bot replies.
--
-- The person chatting with the bot (in the webchat widget) can rate its replies.
-- This is distinct from bot_reply_feedback (migration 052), which is the
-- client's AGENTS rating from the inbox. Visitors aren't auth users, so there's
-- no created_by — we key on the webchat visitor_id. Feeds the bot's quality
-- analytics (client + operator).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.bot_reply_visitor_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id      uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  bot_id          uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  rating          text NOT NULL CHECK (rating IN ('up', 'down')),
  visitor_id      text NOT NULL,         -- the webchat visitor id (not an auth user)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One rating per visitor per reply (re-rating flips it via upsert).
CREATE UNIQUE INDEX IF NOT EXISTS bot_reply_visitor_feedback_unique
  ON public.bot_reply_visitor_feedback (message_id, visitor_id);
CREATE INDEX IF NOT EXISTS bot_reply_visitor_feedback_bot_idx
  ON public.bot_reply_visitor_feedback (bot_id);
CREATE INDEX IF NOT EXISTS bot_reply_visitor_feedback_org_idx
  ON public.bot_reply_visitor_feedback (org_id);

ALTER TABLE public.bot_reply_visitor_feedback ENABLE ROW LEVEL SECURITY;

-- Org members read their org's customer feedback (bot analytics). All writes go
-- through the service-role admin client in the public /api/webchat/rate endpoint
-- (which validates the webchat key + visitor + that the message is the visitor's
-- own bot reply). No anon/authenticated write policy.
DROP POLICY IF EXISTS "org read visitor feedback" ON public.bot_reply_visitor_feedback;
CREATE POLICY "org read visitor feedback" ON public.bot_reply_visitor_feedback
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

GRANT ALL ON public.bot_reply_visitor_feedback TO service_role;
GRANT SELECT ON public.bot_reply_visitor_feedback TO authenticated;

NOTIFY pgrst, 'reload schema';
