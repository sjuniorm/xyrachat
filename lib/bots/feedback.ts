"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBotFeedbackEmail } from "@/lib/email/send";
import { rateLimit } from "@/lib/rate-limit";

export type Rating = "up" | "down";
type Result = { ok: true; rating: Rating | null } | { ok: false; error: string };
type ReasonResult = { ok: true } | { ok: false; error: string };

const MAX_REASON_LEN = 2000;

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

// Attach (or edit) a free-text reason to a thumbs-DOWN on a bot reply, so the
// agent can say *what* went wrong. The first time a reason is added we fire a
// fail-soft Resend notification to the Xyra support inbox so the team can
// proactively help — never on raw 👎 clicks (a typed reason is intentional +
// rare, so this can't spam). No-op email when RESEND/SUPPORT_FEEDBACK_EMAIL
// aren't configured.
export async function submitBotFeedbackReason(
  messageId: string,
  reasonRaw: string,
): Promise<ReasonResult> {
  const reason = (reasonRaw ?? "").trim().slice(0, MAX_REASON_LEN);

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

  // Authorize the message via its conversation's org + confirm it's an AI reply.
  const admin = createAdminClient();
  const { data: msg } = await admin
    .from("messages")
    .select("id, conversation_id, content, sender_type, metadata, conversations!inner(org_id)")
    .eq("id", messageId)
    .maybeSingle();
  const msgOrgId = (msg?.conversations as { org_id?: string } | null)?.org_id;
  if (!msg || msgOrgId !== orgId) return { ok: false, error: "Message not found." };
  const meta = (msg.metadata ?? {}) as { automation?: unknown; bot_id?: string };
  if (msg.sender_type !== "bot" || Boolean(meta.automation)) {
    return { ok: false, error: "Only AI replies can be rated." };
  }
  const botId = typeof meta.bot_id === "string" ? meta.bot_id : null;

  // Find my live rating row for this message. The note UI only appears on a
  // 👎, so a 'down' row normally exists; if it somehow doesn't, create one.
  const { data: existing } = await admin
    .from("bot_reply_feedback")
    .select("id, rating, reason")
    .eq("message_id", messageId)
    .eq("created_by", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  const hadReason = Boolean((existing?.reason ?? "").trim());

  if (existing) {
    const { error } = await admin
      .from("bot_reply_feedback")
      .update({ reason: reason || null, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("bot_reply_feedback").insert({
      org_id: orgId,
      message_id: messageId,
      conversation_id: msg.conversation_id,
      bot_id: botId,
      rating: "down",
      reason: reason || null,
      created_by: user.id,
    });
    if (error) return { ok: false, error: error.message };
  }

  // Notify the team. `!hadReason` is just a cheap pre-filter; the real,
  // churn-proof dedupe is the atomic per-message claim inside notify (an agent
  // can reset `reason` via clear/re-add or toggle the 👎, so we must not rely on
  // it). Fire-and-forget — email failure must never fail the action.
  if (reason && !hadReason) {
    void notifySupportOfNegativeFeedback({
      orgId,
      botId,
      messageId,
      conversationId: msg.conversation_id,
      replyText: typeof msg.content === "string" ? msg.content : "",
      reason,
    }).catch(() => {});
  }

  return { ok: true };
}

async function notifySupportOfNegativeFeedback(args: {
  orgId: string;
  botId: string | null;
  messageId: string;
  conversationId: string;
  replyText: string;
  reason: string;
}): Promise<void> {
  const to = process.env.SUPPORT_FEEDBACK_EMAIL;
  if (!to) return; // not configured → skip silently

  const admin = createAdminClient();

  // ATOMIC one-email-per-bot-reply claim. Insert-if-absent on the immutable
  // message id: only the first caller for this reply gets a row back, so only
  // it sends. Survives bot_reply_feedback row churn (soft-delete + re-insert,
  // reason clear/re-add) because the key is the message, not the feedback row.
  const { data: claimed } = await admin
    .from("bot_feedback_notifications")
    .upsert(
      { message_id: args.messageId, org_id: args.orgId },
      { onConflict: "message_id", ignoreDuplicates: true },
    )
    .select("message_id");
  if (!claimed || claimed.length === 0) return; // already emailed for this reply

  // Defense-in-depth volume cap (an attacker would otherwise need a distinct
  // real bot reply per email, but bound it anyway). Fails OPEN without Upstash.
  const limited = await rateLimit("bot-feedback-email", args.orgId, {
    limit: 30,
    windowSec: 3600,
  });
  if (!limited.ok) return;

  const [{ data: org }, botRes] = await Promise.all([
    admin.from("organizations").select("name").eq("id", args.orgId).maybeSingle(),
    args.botId
      ? admin.from("bots").select("name").eq("id", args.botId).maybeSingle()
      : Promise.resolve({ data: null as { name?: string } | null }),
  ]);

  await sendBotFeedbackEmail(to, {
    orgName: org?.name ?? "Unknown workspace",
    botName: (botRes.data as { name?: string } | null)?.name ?? "a bot",
    replyText: args.replyText,
    reason: args.reason,
    conversationId: args.conversationId,
  });
}
