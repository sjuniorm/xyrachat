-- Migration 028 — push_tokens (Week 13: React Native mobile app)
--
-- Stores Expo push tokens per agent device so the webhook handlers can notify
-- the assigned agent of new inbound messages / assignments / handoffs.
--
-- One row per (user, token). A device that re-registers UPSERTs (refreshing
-- platform + last_seen_at). Soft-delete via deleted_at to honour the GDPR
-- baseline; the mobile app hard-deletes its own row on logout so we stop
-- pushing to a signed-out device immediately.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  token       text NOT NULL,                 -- Expo push token (ExponentPushToken[...])
  platform    text CHECK (platform IN ('ios', 'android', 'web')),
  device_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_active_idx
  ON public.push_tokens (user_id)
  WHERE deleted_at IS NULL;

-- Keep org_id authoritative: always derive it from the owner's profile rather
-- than trusting the client payload (the row is the user's own, but org_id is
-- used for fan-out scoping, so we don't want it spoofable).
CREATE OR REPLACE FUNCTION public.push_tokens_set_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT p.org_id INTO NEW.org_id
  FROM public.profiles p
  WHERE p.id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_tokens_set_org_trg ON public.push_tokens;
CREATE TRIGGER push_tokens_set_org_trg
  BEFORE INSERT OR UPDATE OF user_id ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.push_tokens_set_org();

-- RLS — a user manages ONLY their own device tokens. The push sender runs as
-- service_role (admin client), which bypasses RLS.
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_select_own ON public.push_tokens;
CREATE POLICY push_tokens_select_own ON public.push_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS push_tokens_insert_own ON public.push_tokens;
CREATE POLICY push_tokens_insert_own ON public.push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_update_own ON public.push_tokens;
CREATE POLICY push_tokens_update_own ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_delete_own ON public.push_tokens;
CREATE POLICY push_tokens_delete_own ON public.push_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Explicit grants (Supabase removed Data-API auto-grants for new public tables
-- — see CLAUDE.md "Every new CREATE TABLE migration MUST bundle GRANTs").
GRANT ALL ON public.push_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
