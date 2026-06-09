-- =====================================================================
-- 051_conversation_ratings.sql — CSAT / NPS surveys.
--
-- On conversation close (when org.survey_kind != 'off'), we create a rating
-- request with a random token and message the customer a link
-- (/rate/<token>). They tap a score on a public page; we record it. Link-based
-- so it works on EVERY channel without parsing number-replies per provider.
-- =====================================================================

-- Org-level survey setting.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS survey_kind TEXT NOT NULL DEFAULT 'off'
  CHECK (survey_kind IN ('off', 'csat', 'nps'));

CREATE TABLE IF NOT EXISTS public.conversation_ratings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel_type    text,
  kind            text NOT NULL CHECK (kind IN ('csat', 'nps')),
  token           text NOT NULL UNIQUE,
  score           integer,            -- null until the customer rates
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  rated_at        timestamptz,
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS conversation_ratings_org_idx
  ON public.conversation_ratings (org_id) WHERE deleted_at IS NULL;
-- One pending (un-rated) request per conversation — guards against re-sending
-- a survey every time an agent closes/reopens.
CREATE UNIQUE INDEX IF NOT EXISTS conversation_ratings_pending_idx
  ON public.conversation_ratings (conversation_id)
  WHERE rated_at IS NULL AND deleted_at IS NULL;

ALTER TABLE public.conversation_ratings ENABLE ROW LEVEL SECURITY;

-- Org members read their org's ratings (dashboard). All writes go through the
-- service-role admin client (close-hook + the public /rate page by token) —
-- the token is the customer's bearer, not a session.
DROP POLICY IF EXISTS "org read" ON public.conversation_ratings;
CREATE POLICY "org read" ON public.conversation_ratings
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

GRANT ALL ON public.conversation_ratings TO service_role;
GRANT SELECT ON public.conversation_ratings TO authenticated;

NOTIFY pgrst, 'reload schema';
