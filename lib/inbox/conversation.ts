import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Insert a conversation, racing safely against concurrent webhooks. A
// find-or-create that does SELECT-then-INSERT can create TWO conversations for
// one contact when two inbound events arrive at once (e.g. a comment + a DM, or
// Meta webhook retries). Duplicate conversations then split the per-conversation
// idempotency stamps, which can double-send outbound messages.
//
// With the partial unique index from migration 068
// (UNIQUE (channel_id, contact_id) WHERE deleted_at IS NULL), the loser's INSERT
// fails with 23505; we catch it and re-select the winner instead of creating a
// duplicate. Returns the row id + whether THIS call created it (so callers don't
// double-emit conversation.opened).
//
// Callers keep their own SELECT/reopen logic and use this ONLY for the insert
// step (i.e. when no existing active conversation was found).
export async function insertConversationWithRetry(
  admin: Admin,
  orgId: string,
  channelId: string,
  contactId: string,
): Promise<{ id: string | null; created: boolean }> {
  const ins = await admin
    .from("conversations")
    .insert({ org_id: orgId, channel_id: channelId, contact_id: contactId })
    .select("id")
    .single();
  if (ins.data?.id) return { id: ins.data.id, created: true };
  // 23505 = unique_violation → a concurrent request already created it. Fetch it.
  if (ins.error?.code === "23505") {
    const { data } = await admin
      .from("conversations")
      .select("id")
      .eq("channel_id", channelId)
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { id: data?.id ?? null, created: false };
  }
  return { id: null, created: false };
}
