"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Rating = "up" | "down";
type Result = { ok: true; rating: Rating | null } | { ok: false; error: string };

// Rate (or un-rate) a single bot reply from the inbox bubble. Passing the same
// rating that's already stored CLEARS it (toggle). One live row per
// (message, agent); the unique partial index enforces it, we UPSERT onto it.
export async function rateBotReply(
  messageId: string,
  rating: Rating,
): Promise<Result> {
  if (rating !== "up" && rating !== "down") {
    return { ok: false, error: "Invalid rating." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: me } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = me?.org_id;
  if (!orgId) return { ok: false, error: "Not in an org." };

  // Resolve + authorize the message: must be a bot reply in the caller's org.
  // messages has no org_id column — it inherits the org via its conversation.
  const admin = createAdminClient();
  const { data: msg } = await admin
    .from("messages")
    .select("id, conversation_id, sender_type, metadata, conversations!inner(org_id)")
    .eq("id", messageId)
    .maybeSingle();
  const msgOrgId = (msg?.conversations as { org_id?: string } | null)?.org_id;
  if (!msg || msgOrgId !== orgId) {
    return { ok: false, error: "Message not found." };
  }
  const meta = (msg.metadata ?? {}) as { automation?: unknown; bot_id?: string };
  // Genuine AI bot reply only — automation sends are sender_type='bot' too.
  if (msg.sender_type !== "bot" || Boolean(meta.automation)) {
    return { ok: false, error: "Only AI replies can be rated." };
  }
  const botId = typeof meta.bot_id === "string" ? meta.bot_id : null;

  // Current live rating, if any.
  const { data: existing } = await admin
    .from("bot_reply_feedback")
    .select("id, rating")
    .eq("message_id", messageId)
    .eq("created_by", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  // Toggle off when clicking the rating that's already set.
  if (existing && existing.rating === rating) {
    await admin
      .from("bot_reply_feedback")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { ok: true, rating: null };
  }

  if (existing) {
    const { error } = await admin
      .from("bot_reply_feedback")
      .update({ rating, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, rating };
  }

  const { error } = await admin.from("bot_reply_feedback").insert({
    org_id: orgId,
    message_id: messageId,
    conversation_id: msg.conversation_id,
    bot_id: botId,
    rating,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rating };
}
