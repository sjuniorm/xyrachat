import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConversationRow,
  ContactRow,
  MessageRow,
  ChannelRow,
  ConversationWithRelations,
} from "@/lib/db-types";

/**
 * Lazy snooze-wake — flips any `status='snoozed'` conversation whose
 * `snooze_until` has elapsed back to `status='open'`. Runs on every inbox
 * fetch. Cheap because the WHERE clause is selective and idempotent.
 *
 * For higher precision (wake while no one's viewing), a Supabase pg_cron
 * job calling the same query every minute is the follow-up. The lazy
 * version is enough for MVP.
 */
async function wakeSnoozedConversations(): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ status: "open", snooze_until: null })
    .eq("status", "snoozed")
    .lte("snooze_until", new Date().toISOString());
  if (error) {
    // Don't let a wake failure block the inbox render.
    console.warn("[inbox] wakeSnoozedConversations failed", error);
  }
}

type RawConversation = ConversationRow & {
  contact: ContactRow | null;
  channel: Pick<ChannelRow, "id" | "type" | "name"> | null;
  assigned_agent:
    | { id: string; full_name: string | null; avatar_url: string | null }
    | null;
};

/**
 * Fetches conversations the current user can see (RLS-scoped to their org),
 * with joined contact + channel + assigned agent, plus the latest message
 * preview. Unread count is 0 for now — real per-agent read tracking lands
 * in Week 5.
 */
export async function getConversationsForCurrentOrg(): Promise<
  ConversationWithRelations[]
> {
  await wakeSnoozedConversations();
  const supabase = await createClient();

  const { data: convs } = await supabase
    .from("conversations")
    .select(
      `
        *,
        contact:contacts!conversations_contact_id_fkey(*),
        channel:channels!conversations_channel_id_fkey(id, type, name),
        assigned_agent:profiles!conversations_assigned_to_fkey(id, full_name, avatar_url)
      `,
    )
    .order("last_message_at", { ascending: false });

  const rows = (convs as RawConversation[] | null) ?? [];
  if (rows.length === 0) return [];

  // Latest message preview per conversation — fetched in one query, then
  // deduped client-side. Replace with a SQL view if this gets slow at scale.
  const ids = rows.map((c) => c.id);
  const { data: previewMsgs } = await supabase
    .from("messages")
    .select("conversation_id, content, created_at, direction")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });

  const previews: Record<string, string> = {};
  for (const m of (previewMsgs as Array<{
    conversation_id: string;
    content: string | null;
  }> | null) ?? []) {
    if (!previews[m.conversation_id]) {
      previews[m.conversation_id] = m.content ?? "";
    }
  }

  return rows
    .filter((c): c is RawConversation & { contact: ContactRow; channel: NonNullable<RawConversation["channel"]> } =>
      Boolean(c.contact && c.channel),
    )
    .map((c) => ({
      ...c,
      last_message_preview: previews[c.id] ?? null,
      unread_count: 0,
    }));
}

export async function getConversationDetail(
  id: string,
): Promise<ConversationWithRelations | null> {
  await wakeSnoozedConversations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      `
        *,
        contact:contacts!conversations_contact_id_fkey(*),
        channel:channels!conversations_channel_id_fkey(id, type, name),
        assigned_agent:profiles!conversations_assigned_to_fkey(id, full_name, avatar_url)
      `,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as RawConversation;
  if (!row.contact || !row.channel) return null;
  return {
    ...row,
    contact: row.contact,
    channel: row.channel,
    last_message_preview: null,
    unread_count: 0,
  };
}

export async function getMessagesForConversation(
  conversationId: string,
): Promise<MessageRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data as MessageRow[] | null) ?? [];
}
