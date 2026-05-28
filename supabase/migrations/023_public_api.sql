-- Xyra Chat — Week 11: public REST API + outbound webhooks foundation.
--
-- Tables added:
--   api_keys              — bearer credentials with scopes + expiry
--   webhook_endpoints     — per-org outbound URLs subscribed to events
--   webhook_deliveries    — per-delivery audit + retry state
--   api_request_log       — per-request log (no bodies; PII-clean)
--   api_idempotency_keys  — idempotency cache for POSTs (24h TTL)
--
-- Hashed keys: we store SHA-256(key + APP_PEPPER), never plaintext.
-- Lookup uses constant-time compare on the hash. App-level pepper means
-- a leaked DB without the pepper still can't validate keys.

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  -- First 12 chars (e.g. "xyra_live_a1b2") for UI display + log linking.
  key_prefix TEXT NOT NULL,
  -- SHA-256(plaintext_key + APP_PEPPER) hex. UNIQUE = plaintext is too.
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org
  ON api_keys(org_id) WHERE deleted_at IS NULL;

-- =====================================================================
-- WEBHOOK_ENDPOINTS — per-org subscriptions
-- =====================================================================
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  -- Optional filters: { channel_id: [...], bot_id: [...], tag: [...] }
  filters JSONB NOT NULL DEFAULT '{}',
  -- HMAC signing secret. 32 random bytes hex. Shown ONCE on creation.
  secret TEXT NOT NULL,
  -- Where this subscription came from: dashboard | make | zapier | n8n.
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','make','zapier','n8n','api')),
  active BOOLEAN NOT NULL DEFAULT true,
  consecutive_failures INT NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org
  ON webhook_endpoints(org_id) WHERE deleted_at IS NULL;
-- Per-event lookup at fire time: which endpoints want this event?
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_events
  ON webhook_endpoints USING GIN (events)
  WHERE deleted_at IS NULL AND active = true;

-- =====================================================================
-- WEBHOOK_DELIVERIES — audit + retry state
-- =====================================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_endpoint_id UUID REFERENCES webhook_endpoints(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  -- Stable across retries — consumer dedupes on this.
  event_id UUID NOT NULL,
  payload JSONB NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','succeeded','failed','retrying','exhausted')),
  response_status INT,
  response_body_excerpt TEXT,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON webhook_deliveries(next_retry_at)
  WHERE status IN ('pending','retrying');
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint
  ON webhook_deliveries(webhook_endpoint_id, created_at DESC);

-- =====================================================================
-- API_REQUEST_LOG — per-request audit, NO bodies (PII)
-- =====================================================================
CREATE TABLE IF NOT EXISTS api_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  method TEXT,
  path TEXT,
  status INT,
  duration_ms INT,
  ip INET,
  user_agent TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apilog_key_time
  ON api_request_log(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apilog_org_time
  ON api_request_log(org_id, created_at DESC);

-- =====================================================================
-- API_IDEMPOTENCY_KEYS — caches POST responses for replay-safe retries
-- key = "{api_key_id}:{client_supplied_key}"
-- Prune older than 24h via pg_cron job or app-level cleanup later.
-- =====================================================================
CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  key TEXT PRIMARY KEY,
  status_code INT NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_age
  ON api_idempotency_keys(created_at);

-- =====================================================================
-- RLS — org-scoped on the user-facing tables; idempotency cache is
-- service-role only (writes only via admin client from route handlers).
-- =====================================================================
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_request_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org access" ON api_keys;
CREATE POLICY "org access" ON api_keys FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "org access" ON webhook_endpoints;
CREATE POLICY "org access" ON webhook_endpoints FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "org access" ON webhook_deliveries;
CREATE POLICY "org access" ON webhook_deliveries FOR SELECT
  USING (
    webhook_endpoint_id IN (
      SELECT id FROM webhook_endpoints
      WHERE org_id IN (
        SELECT org_id FROM profiles
        WHERE id = auth.uid() AND deleted_at IS NULL
      ) AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "org access" ON api_request_log;
CREATE POLICY "org access" ON api_request_log FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- api_idempotency_keys: no client policy (service-role only).

NOTIFY pgrst, 'reload schema';
