import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBotGate } from "@/lib/ai/bot-gate";
import { maybeAutoTranslate } from "@/lib/ai/auto-translate";
import { dispatchTrigger } from "@/lib/automations/triggers";

export const runtime = "nodejs";

// Telegram pushes updates via POST. We register a single webhook URL with
// a per-channel `secret_token` (when calling setWebhook on /api/channels/
// telegram/...); Telegram echoes that token back in the
// X-Telegram-Bot-Api-Secret-Token header on every request. We look up the
// channel by that secret. Each channel record stores its secret in the
// existing `webhook_secret` column (introduced in migration 003).
//
// Always return { ok: true } with HTTP 200 — Telegram will retry forever
// on non-2xx. We log raw payloads to webhook_log for replay.
export async function POST(req: NextRequest) {
  const secretFromHeader = req.headers.get("x-telegram-bot-api-secret-token");
  const rawBody = await req.text();
  const admin = createAdminClient();

  // No secret header => not a real Telegram callback. Don't even log the
  // payload (could be a probe).
  if (!secretFromHeader) {
    return NextResponse.json({ ok: true });
  }

  const channel = await findChannelBySecret(secretFromHeader);
  if (!channel) {
    // Log so we can spot misconfigured bots.
    try {
      await admin.from("webhook_log").insert({
        provider: "telegram",
        signature_ok: false,
        payload: { _unknown_secret: true, _raw: rawBody.slice(0, 4000) },
      });
    } catch {
      // never block 200
    }
    return NextResponse.json({ ok: true });
  }

  let update: TelegramUpdate;
  try {
    update = JSON.parse(rawBody) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await admin.from("webhook_log").insert({
      provider: "telegram",
      signature_ok: true,
      payload: update as unknown as Record<string, unknown>,
    });
  } catch {
    // never block 200
  }

  try {
    if (update.message) {
      await handleInbound(channel, update.message);
    }
    // edited_message + channel_post + callback_query etc. land later — for
    // MVP we focus on new direct messages.
  } catch (err) {
    console.error("[telegram webhook] processing failed", err);
  }

  return NextResponse.json({ ok: true });
}

// =====================================================================
// Telegram payload subset
// =====================================================================
type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type TelegramMessage = {
  message_id: number;
  from?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  chat: {
    id: number;
    type: "private" | "group" | "supergroup" | "channel";
  };
  date: number;
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number };
  photo?: Array<{ file_id: string; width: number; height: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string };
  audio?: { file_id: string; mime_type?: string; duration?: number };
  voice?: { file_id: string; mime_type?: string; duration?: number };
  video?: { file_id: string; mime_type?: string; duration?: number };
  sticker?: { file_id: string; emoji?: string };
};

// =====================================================================
// Channel + contact + conversation lookup
// =====================================================================
async function findChannelBySecret(secret: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("channels")
    .select("id, org_id, type, webhook_secret, access_token_vault_id, bot_username, auto_translate_inbound, auto_translate_target_lang")
    .eq("webhook_secret", secret)
    .eq("type", "telegram")
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

type TelegramChannel = NonNullable<Awaited<ReturnType<typeof findChannelBySecret>>>;

async function findOrCreateContact(
  orgId: string,
  telegramUserId: number,
  name: string | null,
): Promise<string | null> {
  const admin = createAdminClient();
  const telegramId = String(telegramUserId);
  const existing = await admin
    .from("contacts")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("telegram_id", telegramId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing.data) {
    if (!existing.data.name && name) {
      await admin.from("contacts").update({ name }).eq("id", existing.data.id);
    }
    return existing.data.id;
  }
  const { data } = await admin
    .from("contacts")
    .insert({ org_id: orgId, telegram_id: telegramId, name })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function findOrCreateConversation(
  orgId: string,
  channelId: string,
  contactId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  // Reopen closed/snoozed threads on new inbound — see WA webhook for
  // the rationale (continuous conversation history per contact).
  const existing = await admin
    .from("conversations")
    .select("id, status")
    .eq("channel_id", channelId)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.data) {
    if (existing.data.status === "closed" || existing.data.status === "snoozed") {
      await admin
        .from("conversations")
        .update({ status: "open", snooze_until: null })
        .eq("id", existing.data.id);
    }
    return existing.data.id;
  }
  const { data } = await admin
    .from("conversations")
    .insert({ org_id: orgId, channel_id: channelId, contact_id: contactId })
    .select("id")
    .single();
  return data?.id ?? null;
}

function extractContent(msg: TelegramMessage): {
  content: string | null;
  media_url: string | null;
  media_type: string | null;
} {
  if (msg.text) return { content: msg.text, media_url: null, media_type: null };
  if (msg.photo && msg.photo.length > 0) {
    // Largest photo is last in the array. Telegram returns file_id only —
    // resolving to a real URL requires a getFile call (deferred).
    return {
      content: msg.caption ?? null,
      media_url: msg.photo[msg.photo.length - 1].file_id,
      media_type: "image",
    };
  }
  if (msg.document) {
    return {
      content: msg.caption ?? msg.document.file_name ?? null,
      media_url: msg.document.file_id,
      media_type: "document",
    };
  }
  if (msg.audio) return { content: null, media_url: msg.audio.file_id, media_type: "audio" };
  if (msg.voice) return { content: null, media_url: msg.voice.file_id, media_type: "audio" };
  if (msg.video) {
    return { content: msg.caption ?? null, media_url: msg.video.file_id, media_type: "video" };
  }
  if (msg.sticker) {
    return { content: msg.sticker.emoji ?? null, media_url: msg.sticker.file_id, media_type: "sticker" };
  }
  return { content: null, media_url: null, media_type: null };
}

async function handleInbound(channel: TelegramChannel, msg: TelegramMessage) {
  if (msg.chat.type !== "private") return; // Bot DMs only for now.
  if (!msg.from) return;
  const admin = createAdminClient();

  const fromName =
    [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ").trim() ||
    msg.from.username ||
    null;
  const contactId = await findOrCreateContact(channel.org_id, msg.from.id, fromName);
  if (!contactId) return;

  const conversationId = await findOrCreateConversation(
    channel.org_id,
    channel.id,
    contactId,
  );
  if (!conversationId) return;

  let repliedToId: string | null = null;
  if (msg.reply_to_message) {
    const tgKey = `${msg.chat.id}:${msg.reply_to_message.message_id}`;
    const { data: replied } = await admin
      .from("messages")
      .select("id")
      .eq("telegram_message_id", tgKey)
      .maybeSingle();
    repliedToId = replied?.id ?? null;
  }

  const extracted = extractContent(msg);
  const tgKey = `${msg.chat.id}:${msg.message_id}`;

  const { data: insertedId, error: insertErr } = await admin.rpc(
    "insert_inbound_telegram_message",
    {
      p_conversation_id: conversationId,
      p_content: extracted.content,
      p_media_url: extracted.media_url,
      p_media_type: extracted.media_type,
      p_telegram_message_id: tgKey,
      p_replied_to_message_id: repliedToId,
      p_metadata: {},
      p_created_at: new Date(msg.date * 1000).toISOString(),
    },
  );
  if (insertErr) {
    console.error("[telegram webhook] insert_inbound_telegram_message failed", insertErr);
    return;
  }
  if (!insertedId) return; // Telegram retry — already stored.

  await admin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  // Auto-translate + bot gate. Run sequentially so the bot sees the
  // translated content if auto-translate flipped it (though we don't
  // overwrite original content — bot still operates on the original).
  if (extracted.content) {
    await maybeAutoTranslate({
      channel: {
        id: channel.id,
        type: channel.type,
        auto_translate_inbound: channel.auto_translate_inbound,
        auto_translate_target_lang: channel.auto_translate_target_lang,
      },
      orgId: channel.org_id,
      contactId,
      messageId: insertedId,
      content: extracted.content,
    });
  }
  await runBotGate({
    channel: { id: channel.id, type: channel.type, org_id: channel.org_id },
    conversationId,
    contactId,
    newMessage: {
      content: extracted.content,
      media_type: extracted.media_type,
      isFirstFromContact: false, // computed at higher cost; defer to greeting logic
    },
  });

  // Automation triggers — Telegram supports conversation_opened (one-shot
  // welcome flow per contact). Keyword triggers are WA/IG-only for now;
  // add tg_keyword later if customers ask for it.
  void dispatchTrigger({
    channel: {
      id: channel.id,
      type: channel.type,
      org_id: channel.org_id,
      access_token_vault_id: (channel as { access_token_vault_id?: string | null }).access_token_vault_id ?? null,
    },
    contactId,
    triggerType: "conversation_opened",
    conversationId,
    triggerData: { telegram_message_id: tgKey },
  });
}
