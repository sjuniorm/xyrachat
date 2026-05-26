-- Xyra Chat — Week 9: WhatsApp templates + broadcasts + opt-out tracking.
--
-- Spec named this file 004_templates_broadcasts.sql but our migration index
-- is already at 018, so we name it accordingly. Apply via Supabase SQL
-- Editor (idempotent — re-runnable during dev).

-- =====================================================================
-- WA_TEMPLATES — pre-approved WhatsApp message templates
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en_US',
  category TEXT NOT NULL CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  -- components: header/body/footer/buttons in Meta's exact shape so we can
  -- POST it directly when syncing. See https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
  components JSONB NOT NULL DEFAULT '[]',
  meta_template_id TEXT,
  meta_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (meta_status IN ('PENDING','APPROVED','REJECTED','DISABLED','PAUSED','IN_APPEAL','LIMIT_EXCEEDED')),
  meta_rejection_reason TEXT,
  -- example values for the {{N}} placeholders, used in the preview pane.
  -- shape: { body: ["Junior","Order #1234"], header: ["..."] }
  example_values JSONB DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_templates_org ON wa_templates(org_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wa_templates_channel ON wa_templates(channel_id)
  WHERE deleted_at IS NULL;
-- Meta enforces (waba_id, name, language) uniqueness on their side; mirror it
-- locally per (channel_id, name, language) so the UI can short-circuit dupes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_templates_channel_name_lang
  ON wa_templates(channel_id, name, language)
  WHERE deleted_at IS NULL;

-- =====================================================================
-- BROADCASTS — outbound campaigns sent to filtered audiences
-- =====================================================================
CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  template_id UUID REFERENCES wa_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  -- variable_mapping per {{N}} placeholder. Shape:
  --   { body: [{ source: 'contact_name' | 'fixed', value?: string }, ...] }
  variable_mapping JSONB DEFAULT '{}',
  -- audience filter applied at send time. Shape:
  --   { all: true } | { tags: ['vip'] } | { lastActiveAfter: '2026-03-01' }
  audience_filter JSONB DEFAULT '{"all":true}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','sending','done','failed','cancelled')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_opt_out_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_org_created
  ON broadcasts(org_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_broadcasts_status
  ON broadcasts(status, scheduled_at)
  WHERE deleted_at IS NULL AND status IN ('scheduled','sending');

-- =====================================================================
-- BROADCAST_RECIPIENTS — per-contact send record for a broadcast
-- =====================================================================
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID REFERENCES broadcasts(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  -- skipped (opt-out / no phone), queued, sent, failed
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','failed','skipped')),
  wa_message_id TEXT,
  error_message TEXT,
  -- Mirror Meta's delivery status here once the WA webhook lands.
  delivery_status TEXT CHECK (delivery_status IN ('sent','delivered','read','failed')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per (broadcast, contact) so retrying the same broadcast doesn't
-- double-send. We don't expect to retry mid-flight but the constraint
-- protects against accidental re-runs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_unique
  ON broadcast_recipients(broadcast_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast_status
  ON broadcast_recipients(broadcast_id, status);

-- =====================================================================
-- OPT-OUT on contacts (Meta requires it for MARKETING templates)
-- =====================================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_out_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_org_optout
  ON contacts(org_id, opted_out)
  WHERE deleted_at IS NULL;

-- =====================================================================
-- OPT_OUT_LOG — audit trail of opt-outs / opt-ins
-- =====================================================================
CREATE TABLE IF NOT EXISTS opt_out_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  channel_type TEXT,
  -- 'opt_out' on first STOP, 'opt_in' on START (or manual re-subscribe).
  action TEXT NOT NULL CHECK (action IN ('opt_out','opt_in')),
  keyword TEXT,
  message_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opt_out_log_contact
  ON opt_out_log(contact_id, created_at DESC);

-- =====================================================================
-- RLS — wa_templates / broadcasts / broadcast_recipients / opt_out_log
-- Templates + broadcasts: full org access. Recipients: gated through the
-- parent broadcast's org. Opt_out_log: read-only for clients via service-
-- role-only writes (handled in app code).
-- =====================================================================
ALTER TABLE wa_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE opt_out_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org access" ON wa_templates;
CREATE POLICY "org access" ON wa_templates FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "org access" ON broadcasts;
CREATE POLICY "org access" ON broadcasts FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "org access" ON broadcast_recipients;
CREATE POLICY "org access" ON broadcast_recipients FOR ALL
  USING (
    broadcast_id IN (
      SELECT id FROM broadcasts
      WHERE org_id IN (
        SELECT org_id FROM profiles
        WHERE id = auth.uid() AND deleted_at IS NULL
      ) AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "org read" ON opt_out_log;
CREATE POLICY "org read" ON opt_out_log FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =====================================================================
-- ACTIVE-ROW VIEWS
-- =====================================================================
CREATE OR REPLACE VIEW wa_templates_active AS
  SELECT * FROM wa_templates WHERE deleted_at IS NULL;
CREATE OR REPLACE VIEW broadcasts_active AS
  SELECT * FROM broadcasts WHERE deleted_at IS NULL;

-- =====================================================================
-- updated_at trigger for templates so the table reflects the last Meta sync
-- =====================================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_wa_templates_updated ON wa_templates;
CREATE TRIGGER touch_wa_templates_updated
  BEFORE UPDATE ON wa_templates
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();
