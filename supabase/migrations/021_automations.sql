-- Xyra Chat — Week 10: Instagram + WhatsApp automations.
--
-- Trigger-based automations (ManyChat-style). An automation belongs to
-- a channel + an org, fires on a `trigger_type` event, and runs an
-- ordered array of `actions`. Execution is logged to automation_logs
-- for analytics + debugging.

CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'ig_new_follower',
    'ig_comment_keyword',
    'ig_story_mention',
    'ig_dm_keyword',
    'wa_keyword',
    'conversation_opened',
    'webhook'
  )),
  -- Per-trigger config. Shapes:
  --   ig_comment_keyword:    { keywords: ['price','info'], post_id: '...'|null }
  --   ig_dm_keyword:         { keywords: ['start','hello'] }
  --   wa_keyword:            { keywords: ['stop_promo'] }
  --   ig_story_mention:      {} (any mention)
  --   ig_new_follower:       {} (currently unsupported — Meta doesn't push)
  --   conversation_opened:   {} (fires once per (automation, contact))
  --   webhook:               {} (fires when /api/automations/<id>/trigger is hit)
  trigger_config JSONB NOT NULL DEFAULT '{}',
  -- Ordered list of action steps. Shape per item:
  --   { type: 'send_dm',       text: 'Hi {{contact_name}}' }
  --   { type: 'tag_contact',   tag: 'lead' }
  --   { type: 'assign_agent',  agent_id: '<profile uuid>' | null }
  --   { type: 'webhook',       url: 'https://...', secret?: '...' }
  --   { type: 'add_to_sequence', sequence_id: '<future placeholder>' }
  --   { type: 'wait',          ms: 60000 }  (placeholder — deferred)
  actions JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  -- Quick counters maintained by the executor for the list view, so we
  -- don't have to aggregate automation_logs on every render.
  run_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_org
  ON automations(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_automations_trigger
  ON automations(channel_id, trigger_type)
  WHERE deleted_at IS NULL AND active = true;

-- =====================================================================
-- AUTOMATION_LOGS — per-execution audit row, used for analytics + debug
-- =====================================================================
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  trigger_data JSONB DEFAULT '{}',
  -- Per-action outcome breakdown. Shape:
  --   [{ type: 'send_dm', ok: true }, { type: 'tag_contact', ok: false, error: '...' }]
  steps JSONB DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('success','failed','skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation
  ON automation_logs(automation_id, created_at DESC);

-- =====================================================================
-- DEDUPE for one-shot triggers: conversation_opened + ig_new_follower
-- fire ONCE per (automation, contact). We use a side table instead of a
-- contact column because that scales independently of automation count.
-- =====================================================================
CREATE TABLE IF NOT EXISTS automation_fires (
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  first_fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (automation_id, contact_id)
);

-- =====================================================================
-- ROW LEVEL SECURITY — org-scoped via profiles
-- automation_logs gated through the parent automation's org.
-- automation_fires is service-role only (executor uses admin client).
-- =====================================================================
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_fires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org access" ON automations;
CREATE POLICY "org access" ON automations FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "org access" ON automation_logs;
CREATE POLICY "org access" ON automation_logs FOR SELECT
  USING (
    automation_id IN (
      SELECT id FROM automations
      WHERE org_id IN (
        SELECT org_id FROM profiles
        WHERE id = auth.uid() AND deleted_at IS NULL
      ) AND deleted_at IS NULL
    )
  );

-- automation_fires: no client policies — write/read via admin client only.

-- =====================================================================
-- updated_at trigger on automations so the list shows fresh edits.
-- =====================================================================
DROP TRIGGER IF EXISTS touch_automations_updated ON automations;
CREATE TRIGGER touch_automations_updated
  BEFORE UPDATE ON automations
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at(); -- defined in migration 018

NOTIFY pgrst, 'reload schema';
