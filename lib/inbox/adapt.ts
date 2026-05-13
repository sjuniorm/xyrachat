// Adapts DB rows into the legacy mock shape Week 2 components already use.
// Saves us from rewriting every component just because the data source changed.
// When we generate real Supabase types in Week 5, we can drop this and have
// the components consume MessageRow / ConversationWithRelations directly.

import type {
  Conversation as UiConversation,
  Message as UiMessage,
} from "@/lib/mock-data";
import type {
  ConversationWithRelations,
  MessageRow,
} from "@/lib/db-types";

function fallbackAvatar(name: string): string {
  const display = (name || "?").trim() || "?";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    display,
  )}&background=9333EA&color=fff&bold=true&size=128`;
}

export function adaptMessage(row: MessageRow): UiMessage {
  const attachments = row.media_url
    ? [
        {
          type: row.media_type === "image" ? ("image" as const) : ("file" as const),
          url: row.media_url,
          name: row.media_url.split("/").pop() ?? "attachment",
        },
      ]
    : undefined;

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    direction: row.direction,
    body: row.content ?? "",
    attachments,
    replied_to_message_id: row.replied_to_message_id ?? undefined,
    created_at: row.created_at,
    delivery_status: row.direction === "outbound" ? row.status : undefined,
    metadata: row.metadata,
  };
}

export function adaptConversation(
  c: ConversationWithRelations,
  messages: MessageRow[] = [],
): UiConversation {
  const contactName = c.contact.name ?? "Unknown contact";
  return {
    id: c.id,
    channel: c.channel.type,
    status: c.status,
    contact: {
      id: c.contact.id,
      name: contactName,
      avatar: c.contact.avatar_url ?? fallbackAvatar(contactName),
      phone: c.contact.phone ?? undefined,
      email: c.contact.email ?? undefined,
      channel_handles: c.contact.phone
        ? [{ channel: c.channel.type, handle: c.contact.phone }]
        : [],
      tags: (c.contact.tags ?? []).map((t) => ({
        label: t,
        color: "purple" as const,
      })),
      notes: c.contact.notes ?? "",
    },
    last_message_preview: c.last_message_preview ?? "",
    last_message_at: c.last_message_at,
    created_at: c.created_at,
    snooze_until: c.snooze_until,
    unread_count: c.unread_count,
    assigned_agent: c.assigned_agent
      ? {
          id: c.assigned_agent.id,
          name: c.assigned_agent.full_name ?? "Agent",
          avatar:
            c.assigned_agent.avatar_url ??
            fallbackAvatar(c.assigned_agent.full_name ?? "Agent"),
        }
      : undefined,
    messages: messages.map(adaptMessage),
  };
}
