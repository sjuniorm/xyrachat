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
 * preview and a real per-agent unread count (number of inbound messages newer
 * than this agent's last_read_at in conversation_reads).
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
  // Latest-message preview + per-agent read state: two independent SELECTs over
  // the same ids. Run in parallel — this fetcher is on the inbox-load hot path.
  const [{ data: previewMsgs }, { data: reads }] = await Promise.all([
    supabase
      .from("messages")
      .select("conversation_id, content, created_at, direction")
      .is("deleted_at", null)
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
    // Per-agent read state (RLS returns only the caller's rows). A conversation
    // is unread when its latest inbound is newer than when this agent last read it.
    supabase
      .from("conversation_reads")
      .select("conversation_id, last_read_at")
      .in("conversation_id", ids),
  ]);

  // Per-agent last_read_at (RLS returns only the caller's rows).
  const readAt: Record<string, number> = {};
  for (const r of (reads as Array<{
    conversation_id: string;
    last_read_at: string;
  }> | null) ?? []) {
    readAt[r.conversation_id] = new Date(r.last_read_at).getTime();
  }

  // Single pass over the (created_at DESC) message list: first message per
  // conversation is the preview; every inbound message newer than this agent's
  // last_read_at is an unread message → real per-agent count.
  const previews: Record<string, string> = {};
  const unreadCount: Record<string, number> = {};
  for (const m of (previewMsgs as Array<{
    conversation_id: string;
    content: string | null;
    created_at: string;
    direction: string;
  }> | null) ?? []) {
    if (!(m.conversation_id in previews)) {
      previews[m.conversation_id] = m.content ?? "";
    }
    if (m.direction === "inbound") {
      const lastRead = readAt[m.conversation_id];
      if (lastRead === undefined || new Date(m.created_at).getTime() > lastRead) {
        unreadCount[m.conversation_id] = (unreadCount[m.conversation_id] ?? 0) + 1;
      }
    }
  }

  return rows
    .filter((c): c is RawConversation & { contact: ContactRow; channel: NonNullable<RawConversation["channel"]> } =>
      Boolean(c.contact && c.channel),
    )
    .map((c) => ({
      ...c,
      last_message_preview: previews[c.id] ?? null,
      unread_count: unreadCount[c.id] ?? 0,
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

/**
 * Resolve which bot (if any) would actually serve a conversation, mirroring
 * the bot gate's Gate-1 selection so the inbox bot-only bar can describe the
 * real behavior:
 *   - serves: a pinned override resolves to a live bot, OR ≥1 live bot is
 *     assigned to the channel. (Used by the bot-only enable guard too.)
 *   - autoReopensClosed: whether the bot that would be chosen auto-reopens a
 *     closed conversation. null = can't be determined statically (multiple
 *     assigned bots with no sticky route yet — the Haiku router picks one at
 *     inbound time). Drives whether the "closed" copy promises silence or a
 *     reopen.
 * Uses the admin client (callers pre-authorize the org).
 */
export async function resolveServingBot(
  channelId: string,
  botIdOverride: string | null,
  routedBotId: string | null,
  orgId: string,
): Promise<{ serves: boolean; autoReopensClosed: boolean | null }> {
  const admin = createAdminClient();

  async function liveBot(id: string): Promise<{ id: string; auto_reopen_closed: boolean | null } | null> {
    const { data } = await admin
      .from("bots")
      .select("id, auto_reopen_closed")
      .eq("id", id)
      .eq("org_id", orgId)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    return (data as { id: string; auto_reopen_closed: boolean | null } | null) ?? null;
  }

  // 1. An override pins the bot, bypassing channel routing.
  if (botIdOverride) {
    const b = await liveBot(botIdOverride);
    if (b) return { serves: true, autoReopensClosed: Boolean(b.auto_reopen_closed) };
  }

  // 2. Live bots assigned to the channel.
  const { data: assigns } = await admin
    .from("bot_assignments")
    .select("bot_id, bots!inner(id, auto_reopen_closed, active, deleted_at, org_id)")
    .eq("channel_id", channelId)
    .eq("active", true)
    .eq("bots.active", true)
    .is("bots.deleted_at", null)
    .eq("bots.org_id", orgId);
  const live = ((assigns ?? []) as Array<{ bots: unknown }>)
    .map((a) => (Array.isArray(a.bots) ? a.bots[0] : a.bots))
    .filter(Boolean) as Array<{ id: string; auto_reopen_closed: boolean | null }>;

  if (live.length === 0) return { serves: false, autoReopensClosed: null };
  if (live.length === 1) {
    return { serves: true, autoReopensClosed: Boolean(live[0].auto_reopen_closed) };
  }
  // Multiple bots share the channel — prefer the sticky routed bot if it's
  // still a live candidate; otherwise the router decides at inbound time.
  if (routedBotId) {
    const r = live.find((b) => b.id === routedBotId);
    if (r) return { serves: true, autoReopensClosed: Boolean(r.auto_reopen_closed) };
  }
  return { serves: true, autoReopensClosed: null };
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

// The CURRENT agent's 👍/👎 on this conversation's bot replies, as a
// { messageId: 'up'|'down' } map for hydrating the inbox bubbles. RLS already
// scopes reads to the agent's org; we additionally filter to created_by = me so
// the control reflects *my* opinion (the team aggregate lives on the bot page).
export type MyBotFeedback = { rating: "up" | "down"; reason: string | null };

export async function getMyBotFeedbackForConversation(
  conversationId: string,
): Promise<Record<string, MyBotFeedback>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  const { data } = await supabase
    .from("bot_reply_feedback")
    .select("message_id, rating, reason")
    .eq("conversation_id", conversationId)
    .eq("created_by", user.id)
    .is("deleted_at", null);
  const map: Record<string, MyBotFeedback> = {};
  for (const r of (data as Array<{ message_id: string; rating: "up" | "down"; reason: string | null }> | null) ?? []) {
    map[r.message_id] = { rating: r.rating, reason: r.reason };
  }
  return map;
}
