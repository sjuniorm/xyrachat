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

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  LOCATION = 'location',
  SYSTEM = 'system',
}

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  CONVERTED = 'converted',
  LOST = 'lost',
}

export enum AutomationTriggerType {
  MESSAGE_RECEIVED = 'message_received',
  CONVERSATION_OPENED = 'conversation_opened',
  CONVERSATION_CLOSED = 'conversation_closed',
  TAG_ADDED = 'tag_added',
  OUTSIDE_BUSINESS_HOURS = 'outside_business_hours',
  KEYWORD_MATCH = 'keyword_match',
  NEW_CONTACT = 'new_contact',
}

export enum AutomationActionType {
  SEND_MESSAGE = 'send_message',
  ASSIGN_AGENT = 'assign_agent',
  ADD_TAG = 'add_tag',
  REMOVE_TAG = 'remove_tag',
  CLOSE_CONVERSATION = 'close_conversation',
  TRIGGER_WEBHOOK = 'trigger_webhook',
  START_CHATBOT = 'start_chatbot',
  SEND_EMAIL = 'send_email',
}

export interface PaginationParams {
  page: number;
  limit: number;
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

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: UserRole;
}

export interface NormalizedMessage {
  channelType: ChannelType;
  channelMessageId: string;
  direction: MessageDirection;
  messageType: MessageType;
  content: string;
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
  senderIdentifier: string;
  timestamp: Date;
}
