-- =====================================================================
-- 060_crm_connections.sql — connected CRMs (HubSpot / Pipedrive / Salesforce).
--
-- An owner/admin connects their CRM via OAuth so Xyra can sync contacts/leads
-- captured in chat into the CRM (the "removes workload" selling point). One row
-- per (org, provider). Tokens live in Supabase Vault — only the vault UUIDs are
-- stored here. Same pattern as calendar_connections (migration 056).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider                text NOT NULL CHECK (provider IN ('hubspot', 'pipedrive', 'salesforce')),
  connected_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  account_label           text,                 -- portal/company name for the UI
  api_base                text,                 -- per-account API base (Pipedrive/Salesforce return one)
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

-- One live connection per (org, provider).
CREATE UNIQUE INDEX IF NOT EXISTS crm_connections_unique_active
  ON public.crm_connections (org_id, provider) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_connections_org_idx
  ON public.crm_connections (org_id) WHERE deleted_at IS NULL;

ALTER TABLE public.crm_connections ENABLE ROW LEVEL SECURITY;

-- Org members READ their org's connections (settings UI). All WRITES go through
-- the service-role admin client in the owner/admin-checked OAuth callbacks +
-- actions — never client-direct (tokens must never be client-reachable).
DROP POLICY IF EXISTS "org read crm connections" ON public.crm_connections;
CREATE POLICY "org read crm connections" ON public.crm_connections
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

GRANT ALL ON public.crm_connections TO service_role;
GRANT SELECT ON public.crm_connections TO authenticated;

NOTIFY pgrst, 'reload schema';
