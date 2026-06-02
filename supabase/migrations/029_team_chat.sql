-- Migration 029 — team_messages (in-app team chat)
--
-- One shared team room per organization: agents/admins/owners message each
-- other, separate from customer conversations. (Complements per-conversation
-- internal notes, which are scoped to a single customer thread.)

CREATE TABLE IF NOT EXISTS public.team_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- References profiles (not auth.users) so PostgREST can embed the sender's
  -- name + avatar in one query. profiles.id IS the auth user id.
  sender_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS team_messages_org_idx
  ON public.team_messages (org_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Read: any non-deleted member of the org (scopes to the caller's active org).
DROP POLICY IF EXISTS "org members read team chat" ON public.team_messages;
CREATE POLICY "org members read team chat" ON public.team_messages
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Post: only as yourself, only into your org.
DROP POLICY IF EXISTS "org members post team chat" ON public.team_messages;
CREATE POLICY "org members post team chat" ON public.team_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Edit/soft-delete: your own messages only.
DROP POLICY IF EXISTS "sender edits own team chat" ON public.team_messages;
CREATE POLICY "sender edits own team chat" ON public.team_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- Explicit grants (Supabase removed Data-API auto-grants for new public tables).
GRANT ALL ON public.team_messages TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.team_messages TO authenticated;

-- Realtime (guarded so re-running the migration doesn't error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
  END IF;
END $$;
