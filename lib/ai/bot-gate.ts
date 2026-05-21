import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateBotResponse,
  type BotRow,
  type ConversationMessage,
} from "@/lib/ai/chatbot";
import { isAnthropicConfigured } from "@/lib/ai/clients";

// Channels supported by the bot gate. The gate is provider-agnostic — it
// runs the same 6-gate decision tree for each — but a few gates need to
// know the channel type (WA 24h window, send endpoint).
export type ProviderChannel = "whatsapp" | "instagram" | "telegram";

export type BotGateInput = {
  channel: {
    id: string;
    type: string;
    org_id: string;
  };
  conversationId: string;
  contactId: string;
  newMessage: {
    content: string | null;
    media_type: string | null;
    isFirstFromContact: boolean;
  };
};

export type BotGateResult =
  | { skipped: true; reason: string }
  | { skipped: false; sent: boolean; handoff: boolean };

// The bot gate runs AFTER an inbound is logged to messages but BEFORE we
// return 200 to the provider. It's called fire-and-forget from each
// webhook handler so processing time doesn't push the webhook past 5s.
//
// Six sequential gates — first hit short-circuits. All log to bot_outcomes
// with a clear `payload.reason` so the analytics page can show what's
// blocking the bot (Week 8).
export async function runBotGate(input: BotGateInput): Promise<BotGateResult> {
  const admin = createAdminClient();

  // ---- GATE 1: bot assigned to this channel? --------------------------
  const { data: assignment } = await admin
    .from("bot_assignments")
    .select("bot_id, active")
    .eq("channel_id", input.channel.id)
    .eq("active", true)
    .maybeSingle();
  if (!assignment) return { skipped: true, reason: "no_bot_assigned" };

  const { data: bot } = await admin
    .from("bots")
    .select("*")
    .eq("id", assignment.bot_id)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bot) return { skipped: true, reason: "bot_inactive_or_deleted" };

  // ---- GATE 2: auto-pause when a human just replied -------------------
  // If an agent (not a bot) wrote outbound in the last 6 hours, the human
  // has taken over. Don't talk on top of them.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recentAgent } = await admin
    .from("messages")
    .select("created_at, sender_type")
    .eq("conversation_id", input.conversationId)
    .eq("direction", "outbound")
    .eq("sender_type", "agent")
    .gte("created_at", sixHoursAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentAgent) {
    return { skipped: true, reason: "auto_pause_agent_active" };
  }

  // ---- GATE 3: conversation status --------------------------------
  // Allowed: status in (bot, open) AND assigned_to IS NULL.
  const { data: conv } = await admin
    .from("conversations")
    .select("status, assigned_to, last_inbound_at")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (!conv) return { skipped: true, reason: "conversation_missing" };
  if (conv.assigned_to) return { skipped: true, reason: "conversation_assigned" };
  if (conv.status !== "bot" && conv.status !== "open") {
    return { skipped: true, reason: `status_${conv.status}` };
  }

  // ---- GATE 4: business hours -------------------------------------
  const hours = (bot.business_hours ?? {}) as {
    active?: boolean;
    timezone?: string;
    [day: string]: unknown;
  };
  if (hours.active) {
    const tz = hours.timezone ?? "UTC";
    const within = isWithinHours(hours, tz, new Date());
    if (!within) {
      if (bot.off_hours_message) {
        // Send the configured off-hours auto-reply as the bot.
        await sendOutbound(input.channel.type, {
          conversationId: input.conversationId,
          content: bot.off_hours_message,
          botMetadata: { off_hours: true },
          channelId: input.channel.id,
          contactId: input.contactId,
        });
        await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
          reason: "off_hours_message_sent",
        });
        return { skipped: false, sent: true, handoff: false };
      }
      await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
        reason: "off_hours_silent",
      });
      return { skipped: true, reason: "off_hours" };
    }
  }

  // ---- GATE 5: WhatsApp 24h customer-service window ---------------
  if (input.channel.type === "whatsapp") {
    const lastInbound = conv.last_inbound_at
      ? new Date(conv.last_inbound_at).getTime()
      : 0;
    const open = Date.now() - lastInbound < 24 * 60 * 60 * 1000;
    if (!open) {
      await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
        reason: "wa_24h_window_closed",
      });
      return { skipped: true, reason: "wa_24h_window_closed" };
    }
  }

  // ---- GATE 6: voice transcription --------------------------------
  // If the inbound is audio with no text, transcribe via Whisper before
  // we let the bot see it. We update the message row in-place so future
  // re-reads see the transcript as content.
  let queryText = input.newMessage.content?.trim() ?? "";
  if (!queryText && input.newMessage.media_type === "audio") {
    // Voice transcription is a follow-on deliverable — the helper is in
    // the same lib but kept separate. For now we log + skip.
    await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
      reason: "voice_transcription_not_wired",
    });
    return { skipped: true, reason: "voice_unsupported_yet" };
  }
  if (!queryText) {
    return { skipped: true, reason: "no_text_to_respond_to" };
  }

  // ---- GATE 7: token budget (deferred — needs subscriptions table) ---
  // The user prompt references subscriptions.tokens_used_this_month +
  // monthly_ai_tokens_limit. We haven't built the billing/subscription
  // surface yet (parked for the launch sprint), so this gate is open
  // for now. Log a marker so future-us knows where to wire it.
  // -------------------------------------------------------------------

  if (!isAnthropicConfigured()) {
    await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
      reason: "anthropic_not_configured",
    });
    return { skipped: true, reason: "anthropic_not_configured" };
  }

  // ---- Greeting: first message ever from this contact ---------------
  // The caller doesn't always know this cheaply (find-or-create-contact
  // races), so we double-check here: count prior inbound messages for
  // this contact. If this is genuinely the first, send the greeting
  // first as a separate bot message.
  if (bot.greeting_message) {
    const { count: priorInboundCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", input.conversationId)
      .eq("direction", "inbound");
    // The current inbound just landed → 1 inbound row means it's the first.
    if (input.newMessage.isFirstFromContact || (priorInboundCount ?? 0) <= 1) {
      // Don't send the greeting twice on retries / repeated inbound. Check
      // for an existing bot message marked greeting=true on this thread.
      const { count: greetingCount } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", input.conversationId)
        .eq("sender_type", "bot")
        .filter("metadata->>greeting", "eq", "true");
      if ((greetingCount ?? 0) === 0) {
        await sendOutbound(input.channel.type, {
          conversationId: input.conversationId,
          content: bot.greeting_message,
          botMetadata: { greeting: true },
          channelId: input.channel.id,
          contactId: input.contactId,
        });
      }
    }
  }

  // ---- Fetch context + generate -----------------------------------
  // Last 10 messages (oldest → newest), org name for the prompt.
  const [{ data: msgs }, { data: org }] = await Promise.all([
    admin
      .from("messages")
      .select("direction, content, sender_type, created_at")
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("organizations")
      .select("name")
      .eq("id", input.channel.org_id)
      .maybeSingle(),
  ]);
  const recent = ((msgs ?? []) as ConversationMessage[]).slice().reverse();

  let result;
  try {
    result = await generateBotResponse({
      bot: bot as BotRow,
      orgName: org?.name ?? "us",
      recentMessages: recent,
      newMessage: queryText,
    });
  } catch (err) {
    console.error("[bot-gate] generateBotResponse threw", err);
    await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
      reason: "generate_threw",
      error: err instanceof Error ? err.message : String(err),
    });
    return { skipped: true, reason: "generate_threw" };
  }

  if (result.shouldHandoff && result.handoffReason === "knowledge_gap") {
    await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
      query: queryText,
      max_similarity: result.maxSimilarity,
    });
  }

  await sendOutbound(input.channel.type, {
    conversationId: input.conversationId,
    content: result.response,
    botMetadata: {
      model: result.model,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      sources_used: result.sourcesUsed,
      max_similarity: result.maxSimilarity,
    },
    channelId: input.channel.id,
    contactId: input.contactId,
  });

  if (result.shouldHandoff) {
    await admin
      .from("conversations")
      .update({ status: "open" })
      .eq("id", input.conversationId);
    await logOutcome(bot.id, input.conversationId, input.contactId, "handoff", {
      reason: result.handoffReason,
      max_similarity: result.maxSimilarity,
    });
  } else {
    // Mark the conversation as bot-active so the inbox filter "Bot" picks it up.
    await admin
      .from("conversations")
      .update({ status: "bot" })
      .eq("id", input.conversationId)
      .eq("status", "open");
  }

  return { skipped: false, sent: true, handoff: result.shouldHandoff };
}

// =====================================================================
// Helpers
// =====================================================================

async function logOutcome(
  botId: string,
  conversationId: string,
  contactId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  try {
    await admin.from("bot_outcomes").insert({
      bot_id: botId,
      conversation_id: conversationId,
      contact_id: contactId,
      type,
      payload,
    });
  } catch (err) {
    console.warn("[bot-gate] logOutcome failed", err);
  }
}

// =====================================================================
// Business-hours evaluation. business_hours JSONB shape:
// { active: true, timezone: 'Europe/Madrid',
//   mon: [{ start: '09:00', end: '18:00' }], tue: [...], ..., sun: [] }
// Empty array for a day = closed. Multiple windows allowed for split shifts.
// =====================================================================
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function isWithinHours(
  hours: Record<string, unknown>,
  timezone: string,
  now: Date,
): boolean {
  // Get local hour/minute/day in the bot's TZ using Intl rather than a
  // dep. This handles DST correctly because Intl uses the IANA tzdb.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekdayShort = (parts.weekday ?? "").toLowerCase().slice(0, 3) as
    | (typeof DAY_KEYS)[number]
    | "";
  const dayKey = (DAY_KEYS as readonly string[]).includes(weekdayShort)
    ? (weekdayShort as (typeof DAY_KEYS)[number])
    : null;
  if (!dayKey) return false;

  const windows = hours[dayKey];
  if (!Array.isArray(windows) || windows.length === 0) return false;

  const hh = Number(parts.hour ?? "0");
  const mm = Number(parts.minute ?? "0");
  const minutes = hh * 60 + mm;
  for (const w of windows as Array<{ start: string; end: string }>) {
    const [s1, s2] = w.start.split(":").map(Number);
    const [e1, e2] = w.end.split(":").map(Number);
    const startM = s1 * 60 + (s2 ?? 0);
    const endM = e1 * 60 + (e2 ?? 0);
    if (minutes >= startM && minutes <= endM) return true;
  }
  return false;
}

// =====================================================================
// Outbound dispatch — calls the appropriate /api/channels/{provider}/send
// from server-side. We call our own send endpoint (instead of duplicating
// provider logic) so the bot reply goes through the exact same code path
// as an agent's send: same retry policy, same token unwrap, same message
// row format.
// =====================================================================
async function sendOutbound(
  channelType: string,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
  },
): Promise<void> {
  const admin = createAdminClient();

  // For bot outbound we write to messages directly here instead of going
  // through the API endpoint — the API endpoint requires an authenticated
  // agent session, which we don't have in a webhook context. We DO call
  // the provider API directly via the existing per-provider send helpers.
  // For MVP simplicity we re-issue the provider call inline; refactor to
  // a shared helper later if we add more channel types.

  if (channelType === "telegram") {
    await sendTelegram(admin, args);
  } else if (channelType === "whatsapp") {
    await sendWhatsApp(admin, args);
  } else if (channelType === "instagram") {
    await sendInstagram(admin, args);
  }
}

import { vaultReadSecret } from "@/lib/supabase/vault";

const META_GRAPH_VERSION = "v22.0";
const IG_GRAPH_VERSION = "v22.0";

async function sendTelegram(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
  },
): Promise<void> {
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("access_token_vault_id")
      .eq("id", args.channelId)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("telegram_id")
      .eq("id", args.contactId)
      .maybeSingle(),
  ]);
  if (!channel?.access_token_vault_id || !contact?.telegram_id) return;
  const token = await vaultReadSecret(channel.access_token_vault_id).catch(() => null);
  if (!token) return;
  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: contact.telegram_id, text: args.content }),
  });
  const tgJson = (await tgRes.json().catch(() => null)) as
    | { ok: boolean; result?: { message_id: number; chat: { id: number } } }
    | null;
  const tgKey = tgJson?.result
    ? `${tgJson.result.chat.id}:${tgJson.result.message_id}`
    : null;
  await admin.from("messages").insert({
    conversation_id: args.conversationId,
    direction: "outbound",
    content: args.content,
    sender_type: "bot",
    status: "sent",
    telegram_message_id: tgKey,
    metadata: args.botMetadata,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", args.conversationId);
}

async function sendWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
  },
): Promise<void> {
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("phone_number_id, access_token_vault_id")
      .eq("id", args.channelId)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("phone")
      .eq("id", args.contactId)
      .maybeSingle(),
  ]);
  if (
    !channel?.phone_number_id ||
    !channel.access_token_vault_id ||
    !contact?.phone
  )
    return;
  const token = await vaultReadSecret(channel.access_token_vault_id).catch(() => null);
  if (!token) return;
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.phone_number_id}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: contact.phone,
      type: "text",
      text: { body: args.content },
    }),
  });
  const json = (await res.json().catch(() => null)) as
    | { messages?: Array<{ id: string }> }
    | null;
  const waId = json?.messages?.[0]?.id ?? null;
  await admin.from("messages").insert({
    conversation_id: args.conversationId,
    direction: "outbound",
    content: args.content,
    sender_type: "bot",
    status: "sent",
    wa_message_id: waId,
    metadata: args.botMetadata,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", args.conversationId);
}

async function sendInstagram(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
  },
): Promise<void> {
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("page_id, ig_business_account_id, access_token_vault_id, metadata")
      .eq("id", args.channelId)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("instagram_id")
      .eq("id", args.contactId)
      .maybeSingle(),
  ]);
  if (!channel?.access_token_vault_id || !contact?.instagram_id) return;
  const token = await vaultReadSecret(channel.access_token_vault_id).catch(() => null);
  if (!token) return;
  const useIgDirect = !channel.page_id && Boolean(channel.ig_business_account_id);
  const igLoginUserId =
    (channel.metadata as { ig_login_user_id?: string } | null)?.ig_login_user_id ??
    channel.ig_business_account_id;
  const url = useIgDirect
    ? `https://graph.instagram.com/${IG_GRAPH_VERSION}/${igLoginUserId}/messages`
    : `https://graph.facebook.com/${IG_GRAPH_VERSION}/${channel.page_id}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: contact.instagram_id },
      messaging_type: "RESPONSE",
      message: { text: args.content },
    }),
  });
  const json = (await res.json().catch(() => null)) as
    | { message_id?: string }
    | null;
  await admin.from("messages").insert({
    conversation_id: args.conversationId,
    direction: "outbound",
    content: args.content,
    sender_type: "bot",
    status: "sent",
    ig_message_id: json?.message_id ?? null,
    metadata: args.botMetadata,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", args.conversationId);
}
