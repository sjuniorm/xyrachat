-- Xyra Chat — Week 7: AI chatbot engine + RAG knowledge base.
--
-- pgvector is already enabled (Week 1). We add five tables:
--   bots                 — configuration per AI assistant
--   bot_sources          — uploaded documents / URLs / pasted text
--   bot_embeddings       — chunked text + 1536-dim vector (OpenAI
--                          text-embedding-3-small)
--   bot_assignments      — which channel uses which bot (UNIQUE channel_id,
--                          MVP one-bot-per-channel)
--   bot_outcomes         — KPI rows for the Week 8 analytics page
--
-- Plus:
--   match_embeddings()   — SECURITY DEFINER RPC for vector similarity search
--   channels.auto_translate_inbound / auto_translate_target_lang — per-channel
--                          zero-click translation
--   contacts.detected_language / detected_language_confidence — caches the
--                          franc-detected language so we don't re-detect every
--                          message from a stable customer

-- =====================================================================
-- BOTS — one row per AI assistant configuration
-- =====================================================================
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  instructions TEXT,
  objective TEXT DEFAULT 'support' CHECK (objective IN (
    'support','lead_generation','website_traffic','sales','booking','qualification','custom'
  )),
  objective_config JSONB DEFAULT '{}'::jsonb,
  tone TEXT DEFAULT 'friendly' CHECK (tone IN (
    'friendly','professional','formal','casual','playful'
  )),
  personality JSONB DEFAULT '{}'::jsonb,
  greeting_message TEXT,
  off_hours_message TEXT,
  business_hours JSONB DEFAULT '{"active": false}'::jsonb,
  knowledge_threshold REAL DEFAULT 0.7,
  language TEXT DEFAULT 'en',
  behavior_rules JSONB DEFAULT '{}'::jsonb,
  handoff_triggers TEXT[],
  active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bots_org
  ON bots(org_id) WHERE deleted_at IS NULL;

-- =====================================================================
-- BOT_SOURCES — what fed the bot
-- =====================================================================
CREATE TABLE IF NOT EXISTS bot_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('document','url','text')),
  title TEXT,
  content TEXT,
  url TEXT,
  file_path TEXT,
  embedding_status TEXT DEFAULT 'pending'
    CHECK (embedding_status IN ('pending','running','done','failed')),
  embedding_error TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_sources_bot
  ON bot_sources(bot_id) WHERE deleted_at IS NULL;

-- =====================================================================
-- BOT_EMBEDDINGS — chunked text + 1536-dim vector
-- =====================================================================
CREATE TABLE IF NOT EXISTS bot_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES bot_sources(id) ON DELETE CASCADE NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ivfflat index for cosine similarity at scale. lists=100 is a reasonable
-- default for tables up to ~1M rows; tune later if needed.
CREATE INDEX IF NOT EXISTS idx_bot_embeddings_vec
  ON bot_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =====================================================================
-- BOT_ASSIGNMENTS — which channel uses which bot (one per channel for MVP)
-- =====================================================================
CREATE TABLE IF NOT EXISTS bot_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id)
);

-- =====================================================================
-- BOT_OUTCOMES — analytics rows for KPI tiles (Week 8)
-- =====================================================================
CREATE TABLE IF NOT EXISTS bot_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'lead_captured','link_clicked','booking_clicked',
    'qualified','unqualified','handoff','resolved','fallback_no_knowledge'
  )),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_outcomes_bot_type
  ON bot_outcomes(bot_id, type, created_at DESC);

-- =====================================================================
-- ROW LEVEL SECURITY — org-scoped via profiles
-- =====================================================================
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org access" ON bots;
CREATE POLICY "org access" ON bots FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "via bot" ON bot_sources;
CREATE POLICY "via bot" ON bot_sources FOR ALL
  USING (
    bot_id IN (
      SELECT id FROM bots
      WHERE org_id = public.current_user_org_id()
        AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "via source" ON bot_embeddings;
CREATE POLICY "via source" ON bot_embeddings FOR ALL
  USING (
    source_id IN (
      SELECT id FROM bot_sources
      WHERE deleted_at IS NULL
        AND bot_id IN (
          SELECT id FROM bots
          WHERE org_id = public.current_user_org_id()
            AND deleted_at IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "via bot" ON bot_assignments;
CREATE POLICY "via bot" ON bot_assignments FOR ALL
  USING (
    bot_id IN (
      SELECT id FROM bots
      WHERE org_id = public.current_user_org_id()
        AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "via bot" ON bot_outcomes;
CREATE POLICY "via bot" ON bot_outcomes FOR ALL
  USING (
    bot_id IN (
      SELECT id FROM bots
      WHERE org_id = public.current_user_org_id()
        AND deleted_at IS NULL
    )
  );

-- =====================================================================
-- match_embeddings — vector similarity search RPC
-- SECURITY DEFINER because RLS on bot_embeddings would be expensive to
-- evaluate per-row inside an ORDER BY. The function still enforces
-- per-bot scoping via the bot_id_param argument; callers should already
-- have verified org access against the bots row before calling.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.match_embeddings(
  query_embedding vector(1536),
  bot_id_param UUID,
  match_count INT DEFAULT 5
)
RETURNS TABLE(
  chunk_text TEXT,
  similarity FLOAT,
  source_id UUID,
  source_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    be.chunk_text,
    1 - (be.embedding <=> query_embedding) AS similarity,
    bs.id AS source_id,
    bs.title AS source_title
  FROM bot_embeddings be
  JOIN bot_sources bs ON be.source_id = bs.id
  WHERE bs.bot_id = bot_id_param
    AND bs.deleted_at IS NULL
  ORDER BY be.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_embeddings(vector, UUID, INT)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_embeddings(vector, UUID, INT)
  TO service_role;

-- =====================================================================
-- Auto-translate inbound — per-channel toggle
-- =====================================================================
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS auto_translate_inbound BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_translate_target_lang TEXT;

-- =====================================================================
-- Cache the franc-detected language on contacts so we don't re-detect on
-- every inbound. Confidence is 0..1 — when we see the SAME language 3x in
-- a row we lock it in and skip detection until we see a different one.
-- =====================================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS detected_language TEXT,
  ADD COLUMN IF NOT EXISTS detected_language_confidence REAL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
