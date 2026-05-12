// Xyra Chat — hand-rolled DB types matching supabase/migrations/003_channels_messages.sql.
// Replace with generated types once we set up `supabase gen types typescript --linked`.

export type ChannelType =
  | "whatsapp"
  | "instagram"
  | "telegram"
  | "email"
  | "facebook";

export type ConversationStatus = "open" | "closed" | "snoozed" | "bot";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";
export type SenderType = "contact" | "agent" | "bot";

export type ChannelRow = {
  id: string;
  org_id: string;
  type: ChannelType;
  name: string;
  phone_number_id: string | null;
  wa_business_account_id: string | null;
  access_token_vault_id: string | null;
  webhook_secret: string | null;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
};

export type ContactRow = {
  id: string;
  org_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  instagram_id: string | null;
  telegram_id: string | null;
  avatar_url: string | null;
  tags: string[];
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type ConversationRow = {
  id: string;
  org_id: string;
  channel_id: string;
  contact_id: string;
  assigned_to: string | null;
  status: ConversationStatus;
  last_message_at: string;
  last_inbound_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type MessageMetadata = {
  ai_assisted?: { action: string; model: string; language?: string };
  transcription?: { text: string; model: string };
  translation_cache?: Record<string, string>;
  wa_template?: { name: string; language: string };
  // Inbound context echoes from Meta — kept for debugging if we ever miss
  // resolving replied_to_message_id.
  wa_context?: { id: string };
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  sender_type: SenderType | null;
  sender_id: string | null;
  status: MessageStatus;
  replied_to_message_id: string | null;
  wa_message_id: string | null;
  ig_message_id: string | null;
  metadata: MessageMetadata;
  deleted_at: string | null;
  created_at: string;
};

// Convenience: a conversation as rendered in the inbox — joined with contact +
// channel + (last) message preview. The DB query joins these views server-side.
export type ConversationWithRelations = ConversationRow & {
  contact: ContactRow;
  channel: Pick<ChannelRow, "id" | "type" | "name">;
  last_message_preview: string | null;
  unread_count: number;
  assigned_agent: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};
