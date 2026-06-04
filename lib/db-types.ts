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
export type Availability = "online" | "away" | "offline";
export type ProfileRole = "owner" | "admin" | "supervisor" | "agent";

export type ChannelMetadata = {
  // Instagram
  ig_username?: string;
  ig_profile_pic_url?: string;
  ig_login_user_id?: string;
  // Telegram
  bot_id?: number;
  bot_first_name?: string;
  // Email
  from_name?: string;
  // Set when the channel was connected via OAuth rather than manual entry.
  oauth?: { connected_at: string; user_id: string };
};

export type ChannelRow = {
  id: string;
  org_id: string;
  type: ChannelType;
  name: string;
  phone_number_id: string | null;
  wa_business_account_id: string | null;
  page_id: string | null;
  ig_business_account_id: string | null;
  bot_username: string | null;
  inbox_email: string | null;
  access_token_vault_id: string | null;
  webhook_secret: string | null;
  active: boolean;
  metadata: ChannelMetadata;
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
  opted_out: boolean;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type BroadcastStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "done"
  | "failed"
  | "cancelled";

export type BroadcastRow = {
  id: string;
  org_id: string;
  channel_id: string | null;
  template_id: string | null;
  name: string;
  variable_mapping: Record<string, unknown>;
  audience_filter: Record<string, unknown>;
  status: BroadcastStatus;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  total_count: number;
  sent_count: number;
  failed_count: number;
  skipped_opt_out_count: number;
  last_error: string | null;
  created_by: string | null;
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
  snooze_until: string | null;
  routed_bot_id: string | null;
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
  // Instagram-specific
  ig_story?: { id: string; url: string | null };
  ig_reactions?: Array<{ from: string; emoji: string }>;
  // Tagged on outbound rows created by broadcast runs so the inbox can
  // surface "sent as part of Broadcast X" if we add that later.
  broadcast_id?: string;
  // Email-specific — stored on every inbound email message so the UI can
  // render the subject line and surface the original HTML body.
  email?: {
    subject?: string;
    from_address?: string;
    from_name?: string;
    to_addresses?: string[];
    cc_addresses?: string[];
    html_body?: string;
    in_reply_to?: string;
    references?: string[];
  };
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
  telegram_message_id: string | null;
  email_message_id: string | null;
  is_internal_note: boolean;
  metadata: MessageMetadata;
  deleted_at: string | null;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  org_id: string | null;
  full_name: string | null;
  email: string | null;
  role: ProfileRole;
  avatar_url: string | null;
  availability: Availability;
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
