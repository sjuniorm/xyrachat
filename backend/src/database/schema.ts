import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'manager', 'agent', 'viewer']);
export const conversationStatusEnum = pgEnum('conversation_status', ['open', 'pending', 'closed']);
export const channelTypeEnum = pgEnum('channel_type', [
  'whatsapp', 'webchat', 'facebook', 'instagram', 'telegram', 'email', 'sms', 'voip',
]);
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const messageTypeEnum = pgEnum('message_type', [
  'text', 'image', 'video', 'audio', 'document', 'location', 'system',
]);
export const leadStatusEnum = pgEnum('lead_status', [
  'new', 'contacted', 'qualified', 'converted', 'lost',
]);
export const automationTriggerEnum = pgEnum('automation_trigger', [
  'message_received', 'conversation_opened', 'conversation_closed',
  'tag_added', 'outside_business_hours', 'keyword_match', 'new_contact',
]);
export const automationActionEnum = pgEnum('automation_action', [
  'send_message', 'assign_agent', 'add_tag', 'remove_tag',
  'close_conversation', 'trigger_webhook', 'start_chatbot', 'send_email',
]);

// ─── Tenants ─────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan: varchar('plan', { length: 50 }).notNull().default('free'),
  settings: jsonb('settings').default({}),
  businessHours: jsonb('business_hours').default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Users ───────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  role: userRoleEnum('role').notNull().default('agent'),
  avatar: text('avatar'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantEmailIdx: uniqueIndex('users_tenant_email_idx').on(table.tenantId, table.email),
  tenantIdx: index('users_tenant_idx').on(table.tenantId),
}));

// ─── Refresh Tokens ──────────────────────────────────────────

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 500 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Contacts (CRM) ─────────────────────────────────────────

export const contacts = pgTable('contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  avatarUrl: text('avatar_url'),
  leadStatus: leadStatusEnum('lead_status').notNull().default('new'),
  channelIdentifiers: jsonb('channel_identifiers').default({}),
  metadata: jsonb('metadata').default({}),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('contacts_tenant_idx').on(table.tenantId),
  tenantPhoneIdx: index('contacts_tenant_phone_idx').on(table.tenantId, table.phone),
  tenantEmailIdx: index('contacts_tenant_email_idx').on(table.tenantId, table.email),
}));

// ─── Tags ────────────────────────────────────────────────────

export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 7 }).notNull().default('#6366f1'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tenantNameIdx: uniqueIndex('tags_tenant_name_idx').on(table.tenantId, table.name),
}));

// ─── Contact Tags (junction) ────────────────────────────────

export const contactTags = pgTable('contact_tags', {
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: uniqueIndex('contact_tags_pk').on(table.contactId, table.tagId),
}));

// ─── Teams / Departments ─────────────────────────────────────

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('teams_tenant_idx').on(table.tenantId),
}));

export const teamMembers = pgTable('team_members', {
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: uniqueIndex('team_members_pk').on(table.teamId, table.userId),
}));

// ─── Channels ────────────────────────────────────────────────

export const channels = pgTable('channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  type: channelTypeEnum('type').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  credentials: jsonb('credentials').default({}),
  config: jsonb('config').default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('channels_tenant_idx').on(table.tenantId),
  tenantTypeIdx: index('channels_tenant_type_idx').on(table.tenantId, table.type),
}));

// ─── Conversations ───────────────────────────────────────────

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id),
  channelId: uuid('channel_id').notNull().references(() => channels.id),
  channelType: channelTypeEnum('channel_type').notNull(),
  status: conversationStatusEnum('status').notNull().default('open'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id),
  assignedTeamId: uuid('assigned_team_id').references(() => teams.id),
  subject: varchar('subject', { length: 500 }),
  lastMessageAt: timestamp('last_message_at'),
  lastMessagePreview: text('last_message_preview'),
  metadata: jsonb('metadata').default({}),
  isBotActive: boolean('is_bot_active').notNull().default(false),
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('conversations_tenant_idx').on(table.tenantId),
  tenantStatusIdx: index('conversations_tenant_status_idx').on(table.tenantId, table.status),
  contactIdx: index('conversations_contact_idx').on(table.contactId),
  assignedUserIdx: index('conversations_assigned_user_idx').on(table.assignedUserId),
  lastMessageIdx: index('conversations_last_message_idx').on(table.tenantId, table.lastMessageAt),
}));

// ─── Conversation Tags ──────────────────────────────────────

export const conversationTags = pgTable('conversation_tags', {
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: uniqueIndex('conversation_tags_pk').on(table.conversationId, table.tagId),
}));

// ─── Messages ────────────────────────────────────────────────

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id'),
  direction: messageDirectionEnum('direction').notNull(),
  messageType: messageTypeEnum('message_type').notNull().default('text'),
  content: text('content'),
  mediaUrl: text('media_url'),
  channelMessageId: varchar('channel_message_id', { length: 255 }),
  metadata: jsonb('metadata').default({}),
  isFromBot: boolean('is_from_bot').notNull().default(false),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  conversationIdx: index('messages_conversation_idx').on(table.conversationId),
  tenantIdx: index('messages_tenant_idx').on(table.tenantId),
  createdAtIdx: index('messages_created_at_idx').on(table.conversationId, table.createdAt),
}));

// ─── Internal Notes ──────────────────────────────────────────

export const internalNotes = pgTable('internal_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  conversationIdx: index('internal_notes_conversation_idx').on(table.conversationId),
}));

// ─── Chatbot Configs ─────────────────────────────────────────

export const chatbotConfigs = pgTable('chatbot_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  systemPrompt: text('system_prompt'),
  welcomeMessage: text('welcome_message'),
  fallbackMessage: text('fallback_message'),
  escalationMessage: text('escalation_message'),
  model: varchar('model', { length: 100 }).notNull().default('gpt-4'),
  temperature: integer('temperature').notNull().default(7),
  maxTokens: integer('max_tokens').notNull().default(500),
  languages: jsonb('languages').default(['en']),
  rules: jsonb('rules').default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('chatbot_configs_tenant_idx').on(table.tenantId),
}));

// ─── Knowledge Base Documents ────────────────────────────────

export const knowledgeBaseDocuments = pgTable('knowledge_base_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  chatbotId: uuid('chatbot_id').references(() => chatbotConfigs.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  sourceType: varchar('source_type', { length: 50 }).notNull(),
  sourceUrl: text('source_url'),
  content: text('content'),
  embeddingStatus: varchar('embedding_status', { length: 50 }).notNull().default('pending'),
  chunkCount: integer('chunk_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('kb_docs_tenant_idx').on(table.tenantId),
  chatbotIdx: index('kb_docs_chatbot_idx').on(table.chatbotId),
}));

// ─── Knowledge Base Chunks (for RAG) ─────────────────────────

export const knowledgeBaseChunks = pgTable('knowledge_base_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull().references(() => knowledgeBaseDocuments.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: jsonb('embedding'),
  chunkIndex: integer('chunk_index').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  documentIdx: index('kb_chunks_document_idx').on(table.documentId),
  tenantIdx: index('kb_chunks_tenant_idx').on(table.tenantId),
}));

// ─── Automation Workflows ────────────────────────────────────

export const automationWorkflows = pgTable('automation_workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  triggerType: automationTriggerEnum('trigger_type').notNull(),
  triggerConfig: jsonb('trigger_config').default({}),
  isActive: boolean('is_active').notNull().default(true),
  executionCount: integer('execution_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('automation_workflows_tenant_idx').on(table.tenantId),
  triggerIdx: index('automation_workflows_trigger_idx').on(table.tenantId, table.triggerType),
}));

// ─── Automation Steps ────────────────────────────────────────

export const automationSteps = pgTable('automation_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').notNull().references(() => automationWorkflows.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull(),
  actionType: automationActionEnum('action_type').notNull(),
  actionConfig: jsonb('action_config').default({}),
  conditionConfig: jsonb('condition_config'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  workflowIdx: index('automation_steps_workflow_idx').on(table.workflowId),
  orderIdx: index('automation_steps_order_idx').on(table.workflowId, table.stepOrder),
}));

// ─── Automation Execution Logs ───────────────────────────────

export const automationLogs = pgTable('automation_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id').notNull().references(() => automationWorkflows.id),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  status: varchar('status', { length: 50 }).notNull(),
  executedSteps: jsonb('executed_steps').default([]),
  error: text('error'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// ─── Notification Preferences ────────────────────────────────

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pushEnabled: boolean('push_enabled').notNull().default(true),
  desktopEnabled: boolean('desktop_enabled').notNull().default(true),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  pushNewMessage: boolean('push_new_message').notNull().default(true),
  pushAssignment: boolean('push_assignment').notNull().default(true),
  emailDigest: boolean('email_digest').notNull().default(false),
  quietHoursStart: varchar('quiet_hours_start', { length: 5 }),
  quietHoursEnd: varchar('quiet_hours_end', { length: 5 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex('notification_prefs_user_idx').on(table.userId, table.tenantId),
}));
