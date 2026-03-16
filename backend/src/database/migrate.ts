import { pool } from '../config/database';
import { logger } from '../utils/logger';

const migrationSQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'agent', 'viewer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE conversation_status AS ENUM ('open', 'pending', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM ('whatsapp', 'webchat', 'facebook', 'instagram', 'telegram', 'email', 'sms', 'voip');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'audio', 'document', 'location', 'system');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE automation_trigger AS ENUM ('message_received', 'conversation_opened', 'conversation_closed', 'tag_added', 'outside_business_hours', 'keyword_match', 'new_contact');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE automation_action AS ENUM ('send_message', 'assign_agent', 'add_tag', 'remove_tag', 'close_conversation', 'trigger_webhook', 'start_chatbot', 'send_email');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  settings JSONB DEFAULT '{}',
  business_hours JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role user_role NOT NULL DEFAULT 'agent',
  avatar TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_idx ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  avatar_url TEXT,
  lead_status lead_status NOT NULL DEFAULT 'new',
  channel_identifiers JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contacts_tenant_idx ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS contacts_tenant_phone_idx ON contacts(tenant_id, phone);
CREATE INDEX IF NOT EXISTS contacts_tenant_email_idx ON contacts(tenant_id, email);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_tenant_name_idx ON tags(tenant_id, name);

-- Contact Tags
CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS teams_tenant_idx ON teams(tenant_id);

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type channel_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  credentials JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS channels_tenant_idx ON channels(tenant_id);
CREATE INDEX IF NOT EXISTS channels_tenant_type_idx ON channels(tenant_id, type);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  channel_id UUID NOT NULL REFERENCES channels(id),
  channel_type channel_type NOT NULL,
  status conversation_status NOT NULL DEFAULT 'open',
  assigned_user_id UUID REFERENCES users(id),
  assigned_team_id UUID REFERENCES teams(id),
  subject VARCHAR(500),
  last_message_at TIMESTAMP,
  last_message_preview TEXT,
  metadata JSONB DEFAULT '{}',
  is_bot_active BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_tenant_idx ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS conversations_tenant_status_idx ON conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS conversations_contact_idx ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS conversations_assigned_user_idx ON conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS conversations_last_message_idx ON conversations(tenant_id, last_message_at);

-- Conversation Tags
CREATE TABLE IF NOT EXISTS conversation_tags (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, tag_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID,
  direction message_direction NOT NULL,
  message_type message_type NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  channel_message_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  is_from_bot BOOLEAN NOT NULL DEFAULT false,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_tenant_idx ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(conversation_id, created_at);

-- Internal Notes
CREATE TABLE IF NOT EXISTS internal_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS internal_notes_conversation_idx ON internal_notes(conversation_id);

-- Chatbot Configs
CREATE TABLE IF NOT EXISTS chatbot_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  system_prompt TEXT,
  welcome_message TEXT,
  fallback_message TEXT,
  escalation_message TEXT,
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-4',
  temperature INTEGER NOT NULL DEFAULT 7,
  max_tokens INTEGER NOT NULL DEFAULT 500,
  languages JSONB DEFAULT '["en"]',
  rules JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chatbot_configs_tenant_idx ON chatbot_configs(tenant_id);

-- Knowledge Base Documents
CREATE TABLE IF NOT EXISTS knowledge_base_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chatbot_id UUID REFERENCES chatbot_configs(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_url TEXT,
  content TEXT,
  embedding_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kb_docs_tenant_idx ON knowledge_base_documents(tenant_id);
CREATE INDEX IF NOT EXISTS kb_docs_chatbot_idx ON knowledge_base_documents(chatbot_id);

-- Knowledge Base Chunks
CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES knowledge_base_documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding JSONB,
  chunk_index INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kb_chunks_document_idx ON knowledge_base_chunks(document_id);
CREATE INDEX IF NOT EXISTS kb_chunks_tenant_idx ON knowledge_base_chunks(tenant_id);

-- Automation Workflows
CREATE TABLE IF NOT EXISTS automation_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_type automation_trigger NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  execution_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS automation_workflows_tenant_idx ON automation_workflows(tenant_id);
CREATE INDEX IF NOT EXISTS automation_workflows_trigger_idx ON automation_workflows(tenant_id, trigger_type);

-- Automation Steps
CREATE TABLE IF NOT EXISTS automation_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  action_type automation_action NOT NULL,
  action_config JSONB DEFAULT '{}',
  condition_config JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS automation_steps_workflow_idx ON automation_steps(workflow_id);
CREATE INDEX IF NOT EXISTS automation_steps_order_idx ON automation_steps(workflow_id, step_order);

-- Automation Logs
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES automation_workflows(id),
  conversation_id UUID REFERENCES conversations(id),
  status VARCHAR(50) NOT NULL,
  executed_steps JSONB DEFAULT '[]',
  error TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  desktop_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_new_message BOOLEAN NOT NULL DEFAULT true,
  push_assignment BOOLEAN NOT NULL DEFAULT true,
  email_digest BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start VARCHAR(5),
  quiet_hours_end VARCHAR(5),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_prefs_user_idx ON notification_preferences(user_id, tenant_id);

-- Row Level Security (enable for multi-tenancy)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DO $$ 
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tenants','users','contacts','conversations','teams','channels','chatbot_configs','automation_workflows','internal_notes','notification_preferences','knowledge_base_documents'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %s', t, t);
    EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
  END LOOP;
END $$;
`;

async function migrate() {
  logger.info('Running database migrations...');
  const client = await pool.connect();
  try {
    await client.query(migrationSQL);
    logger.info('✅ Database migrations completed successfully');
  } catch (error) {
    logger.error('❌ Migration failed', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
