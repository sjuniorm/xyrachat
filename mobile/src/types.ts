// Trimmed mirrors of the web app's lib/db-types.ts — only the columns the
// mobile app reads. Keep field names identical so queries line up.

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
export type Availability = "online" | "away" | "offline";

export type Contact = {
  id: string;
  org_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  instagram_id: string | null;
  telegram_id: string | null;
  avatar_url: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
};

export type ChannelLite = {
  id: string;
  type: ChannelType;
  name: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  sender_type: SenderType | null;
  sender_id: string | null;
  status: MessageStatus;
  is_internal_note: boolean;
  created_at: string;
};

export type Conversation = {
  id: string;
  org_id: string;
  channel_id: string;
  contact_id: string;
  assigned_to: string | null;
  status: ConversationStatus;
  last_message_at: string;
  last_inbound_at: string | null;
  created_at: string;
};

export type ConversationWithRelations = Conversation & {
  contact: Contact | null;
  channel: ChannelLite | null;
  last_message_preview?: string | null;
};

export type Profile = {
  id: string;
  org_id: string | null;
  full_name: string | null;
  email: string | null;
  role: "owner" | "admin" | "supervisor" | "agent";
  avatar_url: string | null;
  availability: Availability;
};
