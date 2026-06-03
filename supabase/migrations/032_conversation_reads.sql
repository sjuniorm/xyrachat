-- Migration 032 — conversation_reads (per-agent read state)
--
-- One row per (conversation, agent) holding when that agent last read the
-- conversation. Drives real unread badges in the inbox + "mark as unread".
-- No deleted_at: this is transient operational read-state (not PII content),
-- and it cascade-deletes with the conversation or the user.

CREATE TABLE IF NOT EXISTS public.conversation_reads (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;

-- A user only ever sees / writes their own read rows.
DROP POLICY IF EXISTS "own reads select" ON public.conversation_reads;
CREATE POLICY "own reads select" ON public.conversation_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own reads insert" ON public.conversation_reads;
CREATE POLICY "own reads insert" ON public.conversation_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own reads update" ON public.conversation_reads;
CREATE POLICY "own reads update" ON public.conversation_reads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT ALL ON public.conversation_reads TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.conversation_reads TO authenticated;
