import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MessageStatus } from "@/lib/db-types";
import { runBotGate } from "@/lib/ai/bot-gate";
import { maybeAutoTranslate } from "@/lib/ai/auto-translate";
import { applyOptOutAction } from "@/lib/contacts/opt-out";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { dispatchTrigger } from "@/lib/automations/triggers";
import { resumeWaitingReplies } from "@/lib/automations/executor";
import { emit } from "@/lib/api/emit";
import { notifyNewInbound } from "@/lib/push/notify";

// Force Node runtime — we need `crypto` for HMAC.
export const runtime = "nodejs";

// =====================================================================
// GET — webhook verification handshake (Meta calls this once at setup).
// =====================================================================
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return new NextResponse("Webhook verify token not configured", { status: 500 });
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// =====================================================================
// POST — incoming webhook events.
// =====================================================================
export async function POST(req: NextRequest) {
  // CRITICAL: read the *raw* body before any JSON parsing.
  // HMAC must be computed over the exact bytes Meta sent.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");
  const signatureOk = verifyMetaSignature(rawBody, signatureHeader);

  const admin = createAdminClient();

  // Reject BEFORE parsing JSON. Log the failed attempt (raw bytes, truncated)
  // so we can spot brute-force or misconfigured callers in webhook_log.
  if (!signatureOk) {
    try {
      await admin.from("webhook_log").insert({
        provider: "whatsapp",
        signature_ok: false,
        payload: { _raw: rawBody.slice(0, 4000) },
      });
    } catch {
      // Never let logging error block the 401 response.
    }
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // Only NOW parse the JSON — signature has been verified against raw bytes.
  let payload: WaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WaWebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  // Log the verified payload for replay + debugging.
  try {
    await admin.from("webhook_log").insert({
      provider: "whatsapp",
      signature_ok: true,
      payload,
    });
  } catch {
    // Never let logging error block the 200 response.
  }

  if (payload.object !== "whatsapp_business_account") {
    // Meta may also send during verification or test pings.
    return NextResponse.json({ received: true });
  }

  // Process asynchronously — Meta must see 200 within 5 seconds.
  // We do the work inline here for now because it's fast; if processing
  // grows we'll move to Vercel Queues (Week 9+).
  try {
    await processPayload(payload);
  } catch (err) {
    console.error("[whatsapp webhook] processing failed", err);
    // Still ack: Meta would retry indefinitely and we have the row in
    // webhook_log to replay manually.
  }

  return NextResponse.json({ received: true });
}

// =====================================================================
// HMAC verification
// =====================================================================
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

// =====================================================================
// Payload types — only the fields we use.
// =====================================================================
type WaWebhookPayload = {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: WaChangeValue;
      field: string;
    }>;
  }>;
};

type WaChangeValue = {
  messaging_product?: string;
  metadata?: {
    phone_number_id: string;
    display_phone_number?: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id: string;
  }>;
  messages?: WaInboundMessage[];
  statuses?: WaStatus[];
};

type WaInboundMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "video" | "document" | "audio" | "sticker" | "reaction" | "location" | "contacts" | "interactive" | "button" | "system";
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  context?: { from?: string; id: string };
};

type WaStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
};

// =====================================================================
// Processing
// =====================================================================
async function processPayload(payload: WaWebhookPayload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const v = change.value;
      const phoneNumberId = v.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const channel = await findChannelByPhoneNumberId(phoneNumberId);
      if (!channel) {
        console.warn(`[wa webhook] no channel for phone_number_id=${phoneNumberId}`);
        continue;
      }

      const contactProfileName =
        v.contacts && v.contacts[0]?.profile?.name
          ? v.contacts[0].profile.name
          : null;

      for (const msg of v.messages ?? []) {
        await handleInbound(channel, msg, contactProfileName);
      }
      for (const status of v.statuses ?? []) {
        await handleStatus(status);
      }
    }
  }
}

async function findChannelByPhoneNumberId(phoneNumberId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("channels")
    .select(
      "id, org_id, type, phone_number_id, access_token_vault_id, auto_translate_inbound, auto_translate_target_lang",
    )
    .eq("phone_number_id", phoneNumberId)
    .eq("type", "whatsapp")
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

async function findOrCreateContact(
  orgId: string,
  phone: string,
  name: string | null,
): Promise<string | null> {
  const admin = createAdminClient();
  const existing = await admin
    .from("contacts")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("phone", phone)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing.data) {
    // Backfill name if we learned it now and it was empty before.
    if (!existing.data.name && name) {
      await admin
        .from("contacts")
        .update({ name })
        .eq("id", existing.data.id);
    }
    return existing.data.id;
  }
  const { data } = await admin
    .from("contacts")
    .insert({ org_id: orgId, phone, name })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function findOrCreateConversation(
  orgId: string,
  channelId: string,
  contactId: string,
): Promise<{ id: string | null; created: boolean }> {
  const admin = createAdminClient();
  // Find the most recent conversation with this contact on this channel —
  // INCLUDING closed/snoozed ones. If the customer messages again after
  // we closed their thread, reopen the same conversation so agents see
  // the full history instead of a fresh empty thread alongside the
  // archived one.
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
    return { id: existing.data.id, created: false };
  }
  const { data } = await admin
    .from("conversations")
    .insert({ org_id: orgId, channel_id: channelId, contact_id: contactId })
    .select("id")
    .single();
  return { id: data?.id ?? null, created: Boolean(data?.id) };
}

function extractContent(msg: WaInboundMessage): {
  content: string | null;
  media_url: string | null;
  media_type: string | null;
} {
  switch (msg.type) {
    case "text":
      return { content: msg.text?.body ?? null, media_url: null, media_type: null };
    case "image":
      // media URL fetching deferred (requires Graph media-lookup call). Store
      // the media id for now; we resolve to a real URL in Week 4.
      return {
        content: msg.image?.caption ?? null,
        media_url: msg.image?.id ?? null,
        media_type: "image",
      };
    case "document":
      return {
        content: msg.document?.filename ?? msg.document?.caption ?? null,
        media_url: msg.document?.id ?? null,
        media_type: "document",
      };
    case "audio":
      return {
        content: null,
        media_url: msg.audio?.id ?? null,
        media_type: "audio",
      };
    case "video":
      return {
        content: msg.video?.caption ?? null,
        media_url: msg.video?.id ?? null,
        media_type: "video",
      };
    default:
      return { content: null, media_url: null, media_type: msg.type };
  }
}

async function handleInbound(
  channel: {
    id: string;
    org_id: string;
    type?: string;
    auto_translate_inbound?: boolean | null;
    auto_translate_target_lang?: string | null;
  },
  msg: WaInboundMessage,
  contactProfileName: string | null,
) {
  const admin = createAdminClient();
  const contactId = await findOrCreateContact(
    channel.org_id,
    msg.from,
    contactProfileName,
  );
  if (!contactId) {
    console.error(
      `[wa webhook] failed to find/create contact for ${msg.from}`,
    );
    return;
  }
  const { id: conversationId, created: wasNewConversation } =
    await findOrCreateConversation(channel.org_id, channel.id, contactId);
  if (!conversationId) {
    console.error(
      `[wa webhook] failed to find/create conversation for contact ${contactId}`,
    );
    return;
  }

  // If Meta says this is a reply to one of OUR previous messages, look up the
  // matching outbound row.
  let repliedToId: string | null = null;
  if (msg.context?.id) {
    const { data: replied } = await admin
      .from("messages")
      .select("id")
      .eq("wa_message_id", msg.context.id)
      .maybeSingle();
    repliedToId = replied?.id ?? null;
  }

  const extracted = extractContent(msg);

  // Idempotent insert via a SECURITY DEFINER function that wraps real
  // ON CONFLICT (wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING.
  // Returns the new message id, or NULL when this was a Meta retry of a
  // wa_message_id we already stored — in that case we skip downstream side
  // effects (no double last_message_at bump).
  const { data: insertedId, error: insertErr } = await admin.rpc(
    "insert_inbound_wa_message",
    {
      p_conversation_id: conversationId,
      p_content: extracted.content,
      p_media_url: extracted.media_url,
      p_media_type: extracted.media_type,
      p_wa_message_id: msg.id,
      p_replied_to_message_id: repliedToId,
      p_metadata: msg.context ? { wa_context: { id: msg.context.id } } : {},
      p_created_at: new Date(Number(msg.timestamp) * 1000).toISOString(),
    },
  );

  if (insertErr) {
    console.error("[wa webhook] insert_inbound_wa_message failed", insertErr);
    return;
  }
  if (!insertedId) return; // ON CONFLICT hit — already processed

  await admin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  // STOP / START keyword detection — Meta requires it for MARKETING
  // templates. We run BEFORE the bot gate so a 'STOP' doesn't get a chatbot
  // reply on top of the unsubscribe confirmation.
  let optedOutNow = false;
  if (extracted.content) {
    const opt = await applyOptOutAction({
      orgId: channel.org_id,
      contactId,
      channelType: "whatsapp",
      content: extracted.content,
    });
    if (opt.action === "opt_out") optedOutNow = true;
    if (opt.confirmation && "phone_number_id" in channel && channel.phone_number_id && "access_token_vault_id" in channel && channel.access_token_vault_id) {
      try {
        const wa = channel as {
          phone_number_id: string | null;
          access_token_vault_id: string | null;
        };
        if (wa.phone_number_id && wa.access_token_vault_id) {
          const token = await vaultReadSecret(wa.access_token_vault_id);
          if (token) {
            await fetch(
              `https://graph.facebook.com/v22.0/${wa.phone_number_id}/messages`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: msg.from,
                  type: "text",
                  text: { body: opt.confirmation },
                }),
              },
            );
          }
        }
      } catch (err) {
        console.error("[wa webhook] opt-out confirm send failed", err);
      }
    }
  }

  if (extracted.content) {
    await maybeAutoTranslate({
      channel: {
        id: channel.id,
        type: channel.type ?? "whatsapp",
        auto_translate_inbound: channel.auto_translate_inbound ?? null,
        auto_translate_target_lang: channel.auto_translate_target_lang ?? null,
      },
      orgId: channel.org_id,
      contactId,
      messageId: insertedId,
      content: extracted.content,
    });
  }

  // Outbound event for external integrations subscribed via webhook_endpoints.
  void emit({
    type: "message.received",
    orgId: channel.org_id,
    data: {
      id: insertedId,
      conversation_id: conversationId,
      contact_id: contactId,
      channel_id: channel.id,
      channel_type: channel.type ?? "whatsapp",
      direction: "inbound",
      content: extracted.content,
      media_type: extracted.media_type,
      created_at: new Date(Number(msg.timestamp) * 1000).toISOString(),
    },
  });
  if (wasNewConversation) {
    void emit({
      type: "conversation.opened",
      orgId: channel.org_id,
      data: {
        id: conversationId,
        contact_id: contactId,
        channel_id: channel.id,
        channel_type: channel.type ?? "whatsapp",
      },
    });
  }
  // Wake the assigned agent's mobile device(s). Fire-and-forget.
  void notifyNewInbound({
    conversationId,
    channelType: channel.type ?? "whatsapp",
    preview: extracted.content,
  });
  // Don't run the bot gate when the contact just unsubscribed — the auto
  // confirm message is the appropriate response and a bot reply on top
  // would be jarring.
  if (!optedOutNow) {
    await runBotGate({
      channel: { id: channel.id, type: channel.type ?? "whatsapp", org_id: channel.org_id },
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

    // Resume any automation parked on a wait_for_reply for this conversation,
    // capturing this inbound as the reply. Fire on ANY inbound (incl. media —
    // a voice note IS a reply; message_text is just empty). Fire-and-forget.
    void resumeWaitingReplies(conversationId, extracted.content ?? "").catch((err) => {
      console.error("[wa] resumeWaitingReplies failed", err);
    });

    // Automation triggers — wa_keyword + conversation_opened (one-shot
    // per (automation, contact); the dispatcher enforces dedupe via
    // automation_fires).
    if (extracted.content) {
      void dispatchTrigger({
        channel: {
          id: channel.id,
          type: channel.type ?? "whatsapp",
          org_id: channel.org_id,
          phone_number_id: (channel as { phone_number_id?: string | null }).phone_number_id ?? null,
          access_token_vault_id: (channel as { access_token_vault_id?: string | null }).access_token_vault_id ?? null,
        },
        contactId,
        triggerType: "wa_keyword",
        matchText: extracted.content,
        conversationId,
        triggerData: { wa_message_id: msg.id, text: extracted.content },
      });
    }
    void dispatchTrigger({
      channel: {
        id: channel.id,
        type: channel.type ?? "whatsapp",
        org_id: channel.org_id,
        phone_number_id: (channel as { phone_number_id?: string | null }).phone_number_id ?? null,
        access_token_vault_id: (channel as { access_token_vault_id?: string | null }).access_token_vault_id ?? null,
      },
      contactId,
      triggerType: "conversation_opened",
      conversationId,
      triggerData: { wa_message_id: msg.id },
    });
  }
}

async function handleStatus(status: WaStatus) {
  const admin = createAdminClient();
  // Drive the status forward only — never regress (e.g. don't overwrite "read"
  // with a delayed "delivered").
  const order: Record<MessageStatus, number> = {
    sent: 0,
    delivered: 1,
    read: 2,
    failed: 3,
  };
  const next = status.status as MessageStatus;
  const { data: current } = await admin
    .from("messages")
    .select("id, status")
    .eq("wa_message_id", status.id)
    .maybeSingle();
  if (!current) return;
  if (next === "failed" || order[next] > order[current.status as MessageStatus]) {
    await admin
      .from("messages")
      .update({ status: next })
      .eq("id", current.id);
  }
}
