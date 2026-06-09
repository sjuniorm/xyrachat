import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import type { MessageStatus } from "@/lib/db-types";
import { runBotGate } from "@/lib/ai/bot-gate";
import { maybeAutoTranslate } from "@/lib/ai/auto-translate";
import { resumeWaitingReplies } from "@/lib/automations/executor";
import { emit } from "@/lib/api/emit";
import { notifyNewInbound } from "@/lib/push/notify";

export const runtime = "nodejs";

const META_GRAPH_VERSION = "v22.0";

// =====================================================================
// GET — webhook verification handshake.
// =====================================================================
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return new NextResponse("Webhook verify token not configured", { status: 500 });
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// =====================================================================
// POST — incoming Messenger events (object "page").
// =====================================================================
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureOk = verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"));
  const admin = createAdminClient();

  if (!signatureOk) {
    try {
      await admin.from("webhook_log").insert({
        provider: "facebook",
        signature_ok: false,
        payload: { _raw: rawBody.slice(0, 4000) },
      });
    } catch {
      /* never block the 401 */
    }
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: FbWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as FbWebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  try {
    await admin.from("webhook_log").insert({ provider: "facebook", signature_ok: true, payload });
  } catch {
    /* never block the 200 */
  }

  if (payload.object !== "page") return NextResponse.json({ received: true });

  try {
    await processPayload(payload);
  } catch (err) {
    console.error("[messenger webhook] processing failed", err);
  }
  return NextResponse.json({ received: true });
}

// Messenger webhooks are signed with the original (Facebook) Meta app secret.
function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  const provided = header.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

// ===================== Payload types (only what we use) =====================
type FbWebhookPayload = {
  object: string;
  entry: Array<{ id: string; time?: number; messaging?: FbMessagingEvent[] }>;
};
type FbMessagingEvent = {
  sender: { id: string }; // PSID
  recipient: { id: string }; // Page id
  timestamp: number;
  message?: FbInboundMessage;
  read?: { mid?: string; watermark?: number };
  delivery?: { mids?: string[] };
};
type FbInboundMessage = {
  mid: string;
  text?: string;
  is_echo?: boolean;
  reply_to?: { mid?: string };
  attachments?: Array<{
    type: "image" | "video" | "audio" | "file" | "fallback";
    payload?: { url?: string };
  }>;
};

// ===================== Processing =====================
async function processPayload(payload: FbWebhookPayload) {
  for (const entry of payload.entry ?? []) {
    const channel = await findChannelByPageId(entry.id);
    if (!channel) {
      console.warn(`[messenger webhook] no channel for page=${entry.id}`);
      continue;
    }
    for (const ev of entry.messaging ?? []) {
      if (ev.message?.is_echo) continue; // our own outbound bounced back
      if (ev.message) {
        await handleInbound(channel, ev);
      } else if (ev.read) {
        await handleStatus(ev.read.mid, "read");
      } else if (ev.delivery?.mids) {
        for (const mid of ev.delivery.mids) await handleStatus(mid, "delivered");
      }
    }
  }
}

async function findChannelByPageId(pageId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("channels")
    .select(
      "id, org_id, type, page_id, access_token_vault_id, auto_translate_inbound, auto_translate_target_lang",
    )
    .eq("page_id", pageId)
    .eq("type", "facebook")
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}
type FbChannel = NonNullable<Awaited<ReturnType<typeof findChannelByPageId>>>;

async function fetchProfile(
  channel: FbChannel,
  psid: string,
): Promise<{ name: string | null; avatar_url: string | null }> {
  if (!channel.access_token_vault_id) return { name: null, avatar_url: null };
  try {
    const token = await vaultReadSecret(channel.access_token_vault_id);
    if (!token) return { name: null, avatar_url: null };
    // Token goes in the Authorization header, NOT the URL query string — a
    // token in the URL leaks into proxy/access logs. Matches the send route +
    // connect page in this channel.
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${psid}?fields=name,profile_pic`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { name: null, avatar_url: null };
    const j = (await res.json()) as { name?: string; profile_pic?: string };
    return { name: j.name ?? null, avatar_url: j.profile_pic ?? null };
  } catch {
    return { name: null, avatar_url: null };
  }
}

async function findOrCreateContact(channel: FbChannel, psid: string): Promise<string | null> {
  const admin = createAdminClient();
  const existing = await admin
    .from("contacts")
    .select("id, name, avatar_url")
    .eq("org_id", channel.org_id)
    .eq("messenger_id", psid)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing.data) {
    if (!existing.data.name || !existing.data.avatar_url) {
      const p = await fetchProfile(channel, psid);
      const patch: Record<string, string> = {};
      if (!existing.data.name && p.name) patch.name = p.name;
      if (!existing.data.avatar_url && p.avatar_url) patch.avatar_url = p.avatar_url;
      if (Object.keys(patch).length > 0) {
        await admin.from("contacts").update(patch).eq("id", existing.data.id);
      }
    }
    return existing.data.id;
  }
  const p = await fetchProfile(channel, psid);
  const { data } = await admin
    .from("contacts")
    .insert({ org_id: channel.org_id, messenger_id: psid, name: p.name, avatar_url: p.avatar_url })
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

function extractContent(msg: FbInboundMessage): {
  content: string | null;
  media_url: string | null;
  media_type: string | null;
} {
  const att = msg.attachments?.[0];
  if (att && att.type !== "fallback") {
    const url = att.payload?.url ?? null;
    const t = att.type === "file" ? "file" : att.type; // image|video|audio|file
    return { content: msg.text ?? null, media_url: url, media_type: t };
  }
  return { content: msg.text ?? null, media_url: null, media_type: null };
}

async function handleInbound(channel: FbChannel, ev: FbMessagingEvent) {
  const msg = ev.message!;
  const admin = createAdminClient();

  const contactId = await findOrCreateContact(channel, ev.sender.id);
  if (!contactId) return;
  const conversationId = await findOrCreateConversation(channel.org_id, channel.id, contactId);
  if (!conversationId) return;

  let repliedToId: string | null = null;
  if (msg.reply_to?.mid) {
    const { data: replied } = await admin
      .from("messages")
      .select("id")
      .eq("messenger_message_id", msg.reply_to.mid)
      .maybeSingle();
    repliedToId = replied?.id ?? null;
  }

  const extracted = extractContent(msg);
  const { data: insertedId, error: insertErr } = await admin.rpc(
    "insert_inbound_messenger_message",
    {
      p_conversation_id: conversationId,
      p_content: extracted.content,
      p_media_url: extracted.media_url,
      p_media_type: extracted.media_type,
      p_messenger_message_id: msg.mid,
      p_replied_to_message_id: repliedToId,
      p_metadata: {},
      p_created_at: new Date(ev.timestamp).toISOString(),
    },
  );
  if (insertErr) {
    console.error("[messenger webhook] insert failed", insertErr);
    return;
  }
  if (!insertedId) return; // duplicate (Meta retry)

  await admin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

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

  void emit({
    type: "message.received",
    orgId: channel.org_id,
    data: {
      id: insertedId,
      conversation_id: conversationId,
      contact_id: contactId,
      channel_id: channel.id,
      channel_type: channel.type,
      direction: "inbound",
      content: extracted.content,
      media_type: extracted.media_type,
      created_at: new Date(ev.timestamp).toISOString(),
    },
  });
  void notifyNewInbound({
    conversationId,
    channelType: channel.type,
    preview: extracted.content,
  });
  await runBotGate({
    channel: { id: channel.id, type: channel.type, org_id: channel.org_id },
    conversationId,
    contactId,
    newMessage: {
      content: extracted.content,
      media_type: extracted.media_type,
      isFirstFromContact: false,
      media_url: extracted.media_url,
      messageId: insertedId,
    },
  });
  void resumeWaitingReplies(conversationId, extracted.content ?? "").catch((err) => {
    console.error("[messenger] resumeWaitingReplies failed", err);
  });
}

async function handleStatus(mid: string | undefined, next: "delivered" | "read") {
  if (!mid) return;
  const admin = createAdminClient();
  const order: Record<MessageStatus, number> = { sent: 0, delivered: 1, read: 2, failed: 3 };
  const { data: current } = await admin
    .from("messages")
    .select("id, status")
    .eq("messenger_message_id", mid)
    .maybeSingle();
  if (!current) return;
  if (order[next] > order[current.status as MessageStatus]) {
    await admin.from("messages").update({ status: next }).eq("id", current.id);
  }
}
