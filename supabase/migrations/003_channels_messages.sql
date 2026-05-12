-- Xyra Chat — Week 3: channels, contacts, conversations, messages
-- (Spec called this 002 but our 002 is reserved for the org-insert policy.)
--
-- Apply by pasting into Supabase SQL Editor. Idempotent where possible so it
-- can be re-run cleanly during development; production-grade DOWN migrations
-- arrive once we adopt the Supabase CLI properly.
--
-- Before running: Supabase → Project Settings → Vault → ENABLE Vault.
-- Tokens stored via vault.create_secret in app code; only the secret UUID
-- lives in channels.access_token_vault_id below.

-- =====================================================================
-- CHANNELS — one row per connected sender (WA / IG / Telegram / Email / FB)
-- =====================================================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('whatsapp','instagram','telegram','email','facebook')),
  name TEXT NOT NULL,
  phone_number_id TEXT,
  wa_business_account_id TEXT,
  access_token_vault_id UUID, -- references vault.secrets(id); raw token NEVER stored here
  webhook_secret TEXT,
  active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_org ON channels(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_phone_number_id ON channels(phone_number_id)
  WHERE phone_number_id IS NOT NULL AND deleted_at IS NULL;

-- =====================================================================
-- CONTACTS — one row per end-user (the customer)
-- =====================================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  instagram_id TEXT,
  telegram_id TEXT,
  avatar_url TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_org_phone ON contacts(org_id, phone)
  WHERE deleted_at IS NULL;

-- =====================================================================
-- CONVERSATIONS — a thread between one contact and one channel
-- =====================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES channels(id) NOT NULL,
  contact_id UUID REFERENCES contacts(id) NOT NULL,
  assigned_to UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed','snoozed','bot')),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_inbound_at TIMESTAMPTZ, -- WhatsApp 24h customer-service window check (Week 7)
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_status ON conversations(org_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_contact_channel
  ON conversations(contact_id, channel_id)
  WHERE deleted_at IS NULL;

-- =====================================================================
-- MESSAGES — every inbound + outbound message
-- =====================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  sender_type TEXT CHECK (sender_type IN ('contact','agent','bot')),
  sender_id UUID,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent','delivered','read','failed')),
  replied_to_message_id UUID REFERENCES messages(id),
  wa_message_id TEXT,
  ig_message_id TEXT,
  -- metadata shape examples:
  --   { ai_assisted: { action, model, language? } }
  --   { transcription: { text, model } }                  -- audio (Week 7)
  --   { translation_cache: { [lang]: text } }
  --   { wa_template: { name, language } }                 -- outbound templates
  metadata JSONB DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at DESC);

-- IDEMPOTENCY: Meta retries webhook deliveries. Without these unique
-- indexes, a retried delivery creates duplicate message rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_unique
  ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_ig_unique
  ON messages(ig_message_id) WHERE ig_message_id IS NOT NULL;

-- =====================================================================
-- WEBHOOK_LOG — raw provider payloads for replay + debugging
-- =====================================================================
CREATE TABLE IF NOT EXISTS webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('whatsapp','instagram','telegram','email','facebook')),
  signature_ok BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_log_received ON webhook_log(provider, received_at DESC);

-- =====================================================================
-- ROW LEVEL SECURITY
-- Every policy: org-scoped via profiles + AND deleted_at IS NULL.
-- webhook_log is admin-only (no policies → admin client only).
-- =====================================================================
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org access" ON channels;
CREATE POLICY "org access" ON channels FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "org access" ON contacts;
CREATE POLICY "org access" ON contacts FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "org access" ON conversations;
CREATE POLICY "org access" ON conversations FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "org access" ON messages;
CREATE POLICY "org access" ON messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE org_id IN (
        SELECT org_id FROM profiles
        WHERE id = auth.uid() AND deleted_at IS NULL
      ) AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- =====================================================================
-- ACTIVE-ROW VIEWS (pre-filter deleted_at IS NULL per CLAUDE.md baseline)
-- =====================================================================
CREATE OR REPLACE VIEW channels_active AS
  SELECT * FROM channels WHERE deleted_at IS NULL;
CREATE OR REPLACE VIEW contacts_active AS
  SELECT * FROM contacts WHERE deleted_at IS NULL;
CREATE OR REPLACE VIEW conversations_active AS
  SELECT * FROM conversations WHERE deleted_at IS NULL;
CREATE OR REPLACE VIEW messages_active AS
  SELECT * FROM messages WHERE deleted_at IS NULL;

-- =====================================================================
-- REALTIME — enable Realtime broadcasts for messages + conversations
-- so the inbox UI gets live INSERT/UPDATE events.
-- =====================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
