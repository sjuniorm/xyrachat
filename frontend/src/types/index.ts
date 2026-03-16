export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  AGENT = 'agent',
  VIEWER = 'viewer',
}

export enum ConversationStatus {
  OPEN = 'open',
  PENDING = 'pending',
  CLOSED = 'closed',
}

export enum ChannelType {
  WHATSAPP = 'whatsapp',
  WEBCHAT = 'webchat',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  SMS = 'sms',
  VOIP = 'voip',
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  CONVERTED = 'converted',
  LOST = 'lost',
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatar?: string;
  tenantId: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  contact_id: string;
  channel_id: string;
  channel_type: ChannelType;
  status: ConversationStatus;
  assigned_user_id?: string;
  assigned_team_id?: string;
  subject?: string;
  last_message_at?: string;
  last_message_preview?: string;
  is_bot_active: boolean;
  created_at: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_avatar?: string;
  contact_phone?: string;
  contact_email?: string;
  assigned_first_name?: string;
  assigned_last_name?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id?: string;
  direction: MessageDirection;
  message_type: string;
  content?: string;
  media_url?: string;
  is_from_bot: boolean;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  delivered_at?: string;
  read_at?: string;
  created_at: string;
  sender_first_name?: string;
  sender_last_name?: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  lead_status: LeadStatus;
  notes?: string;
  metadata?: Record<string, any>;
  tags?: Tag[];
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  member_count?: number;
  members?: User[];
}

export interface ChatbotConfig {
  id: string;
  name: string;
  system_prompt?: string;
  welcome_message?: string;
  fallback_message?: string;
  model: string;
  temperature: number;
  max_tokens: number;
  languages: string[];
  rules: string[];
  is_active: boolean;
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  is_active: boolean;
  execution_count: number;
  steps?: AutomationStep[];
}

export interface AutomationStep {
  id: string;
  step_order: number;
  action_type: string;
  action_config: Record<string, any>;
  condition_config?: Record<string, any>;
}

export interface AnalyticsOverview {
  totalConversations: number;
  totalContacts: number;
  openConversations: number;
  botMessages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
