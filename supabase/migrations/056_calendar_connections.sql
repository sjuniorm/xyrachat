-- =====================================================================
-- 056_calendar_connections.sql — connected Google / Outlook calendars.
--
-- An owner/admin connects their Google Calendar and/or Microsoft (Outlook)
-- calendar via OAuth so the booking-objective bot can check free/busy and
-- create events (the "we remove your workload" selling point). One row per
-- connected calendar account. Tokens live in Supabase Vault (same pattern as
-- channel access tokens) — only the vault UUIDs are stored here, never raw
-- tokens. See _docs/calendar-integration-design.md.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider                text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  connected_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  account_email           text,
  calendar_id             text NOT NULL DEFAULT 'primary',
  -- Vault secret UUIDs (vault.secrets.id) — raw tokens NEVER stored here.
  access_token_vault_id   uuid,
  refresh_token_vault_id  uuid,
  token_expires_at        timestamptz,
  scopes                  text,
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'revoked', 'error')),
  error_message           text,
  last_sync_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

-- One live connection per (org, provider, account).
CREATE UNIQUE INDEX IF NOT EXISTS calendar_connections_unique_active
  ON public.calendar_connections (org_id, provider, account_email)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS calendar_connections_org_idx
  ON public.calendar_connections (org_id) WHERE deleted_at IS NULL;

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

-- Org members READ their org's connections (settings UI). All WRITES go through
-- the service-role admin client in the owner/admin-checked OAuth callbacks +
-- actions — never client-direct (tokens must never be client-reachable).
DROP POLICY IF EXISTS "org read calendar connections" ON public.calendar_connections;
CREATE POLICY "org read calendar connections" ON public.calendar_connections
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

GRANT ALL ON public.calendar_connections TO service_role;
GRANT SELECT ON public.calendar_connections TO authenticated;

NOTIFY pgrst, 'reload schema';
