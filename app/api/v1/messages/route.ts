import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey, logApiRequest } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { invalidRequest, notFound, unprocessable, rateLimited } from "@/lib/api/errors";
import { rateLimit } from "@/lib/rate-limit";
import {
  getCachedIdempotentResponse,
  storeIdempotentResponse,
} from "@/lib/api/idempotency";
import { emit } from "@/lib/api/emit";

export const runtime = "nodejs";

// POST /api/v1/messages — send a message via the conversation's channel.
//
// This is the killer endpoint — most integrations use it. Honors:
//  - WA 24h customer-service window (returns 422 if outside + type=text)
//  - Idempotency-Key header for at-most-once semantics
//  - Provider routing by channel type (WA / IG / Telegram)
type SendBody = {
  conversation_id: string;
  content?: string;
  type?: "text" | "template" | "image";
  template?: {
    name: string;
    language: string;
    components?: unknown[];
  };
  media?: { url: string };
};

const META_GRAPH_VERSION = "v22.0";

export async function POST(req: NextRequest) {
  const start = Date.now();
  const auth = await requireApiKey(req, "messages:write");
  if (!auth.ok) return auth.response;

  // Rate limit per org — prevents a leaked/abused key (or many keys) from
  // spamming the provider and racking up cost / a number ban.
  const rl = await rateLimit("api:messages:send", auth.ctx.orgId, {
    limit: 120,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimited(rl.retryAfter);

  const idempotencyKey = req.headers.get("idempotency-key");
  const cached = await getCachedIdempotentResponse(auth.ctx.apiKeyId, idempotencyKey);
  if (cached) return NextResponse.json(cached.body, { status: cached.status });

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return invalidRequest("invalid_json", "Request body must be valid JSON.");
  }
  const type = body.type ?? "text";
  if (!body.conversation_id) {
    return invalidRequest("missing_field", "conversation_id is required.", "conversation_id");
  }
  if (type === "text" && !body.content?.trim()) {
    return invalidRequest("missing_field", "content is required for text messages.", "content");
  }
  if (type === "template" && !body.template?.name) {
    return invalidRequest("missing_field", "template.name is required.", "template");
  }

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("id, org_id, channel_id, contact_id, last_inbound_at")
    .eq("id", body.conversation_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conv) return notFound("Conversation not found.");
  if (conv.org_id !== auth.ctx.orgId) return notFound("Conversation not found.");

  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("id, type, phone_number_id, page_id, ig_business_account_id, access_token_vault_id, metadata")
      .eq("id", conv.channel_id)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("id, phone, instagram_id, telegram_id, messenger_id, opted_out")
      .eq("id", conv.contact_id)
      .maybeSingle(),
  ]);
  if (!channel) return notFound("Channel not found.");
  if (!contact) return notFound("Contact not found.");

  if (contact.opted_out) {
    return unprocessable(
      "contact_opted_out",
      "Contact has opted out and cannot be messaged.",
      "conversation_id",
    );
  }

  // WhatsApp 24h customer-service window — free-form text only allowed
  // within 24h of the contact's last inbound. Otherwise the caller must
  // use type=template.
  if (channel.type === "whatsapp" && type === "text") {
    const lastIn = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
    if (Date.now() - lastIn > 24 * 60 * 60 * 1000) {
      return unprocessable(
        "wa_window_closed",
        "WhatsApp 24-hour customer service window is closed. Send a template instead.",
        "type",
      );
    }
  }

  if (!channel.access_token_vault_id) {
    return unprocessable("channel_not_ready", "Channel is missing access token.", "conversation_id");
  }
  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) {
    return unprocessable("channel_not_ready", "Channel token unreadable.", "conversation_id");
  }

  const result = await sendViaProvider({
    channel,
    contact,
    token,
    type,
    content: body.content,
    template: body.template,
    media: body.media,
  });
  if (!result.ok) {
    return unprocessable(result.code, result.error);
  }

  // Persist outbound row.
  const insertCols: Record<string, unknown> = {
    conversation_id: conv.id,
    direction: "outbound",
    content: type === "text" ? body.content?.trim() : null,
    media_url: body.media?.url ?? null,
    media_type: body.media?.url ? "image" : null,
    sender_type: "agent",
    sender_id: null, // API-key origin; no user
    status: "sent",
    metadata: type === "template" && body.template
      ? { wa_template: { name: body.template.name, language: body.template.language } }
      : { source: "api" },
  };
  if (channel.type === "whatsapp" && result.providerMessageId) {
    insertCols.wa_message_id = result.providerMessageId;
  } else if (channel.type === "instagram" && result.providerMessageId) {
    insertCols.ig_message_id = result.providerMessageId;
  } else if (channel.type === "telegram" && result.providerMessageId) {
    insertCols.telegram_message_id = result.providerMessageId;
  } else if (channel.type === "facebook" && result.providerMessageId) {
    insertCols.messenger_message_id = result.providerMessageId;
  }
  const { data: stored } = await admin
    .from("messages")
    .insert(insertCols)
    .select("id, created_at")
    .single();

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  const resBody = {
    object: "message",
    id: stored?.id ?? null,
    conversation_id: conv.id,
    direction: "outbound",
    type,
    content: type === "text" ? body.content?.trim() ?? null : null,
    provider_message_id: result.providerMessageId,
    created_at: stored?.created_at ?? new Date().toISOString(),
  };
  void storeIdempotentResponse(auth.ctx.apiKeyId, idempotencyKey, {
    status: 201,
    body: resBody,
  });
  void emit({
    type: "message.sent",
    orgId: auth.ctx.orgId,
    data: resBody as Record<string, unknown>,
  });
  void logApiRequest({
    apiKeyId: auth.ctx.apiKeyId,
    orgId: auth.ctx.orgId,
    method: "POST",
    path: "/api/v1/messages",
    status: 201,
    durationMs: Date.now() - start,
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    idempotencyKey,
  });
  return NextResponse.json(resBody, { status: 201 });
}

async function sendViaProvider(input: {
  channel: {
    type: string;
    phone_number_id: string | null;
    page_id: string | null;
    ig_business_account_id: string | null;
    metadata: Record<string, unknown> | null;
  };
  contact: {
    phone: string | null;
    instagram_id: string | null;
    telegram_id: string | null;
    messenger_id: string | null;
  };
  token: string;
  type: "text" | "template" | "image";
  content?: string;
  template?: { name: string; language: string; components?: unknown[] };
  media?: { url: string };
}): Promise<
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: string; error: string }
> {
  const { channel, contact, token, type, content, template, media } = input;

  if (channel.type === "whatsapp") {
    if (!channel.phone_number_id) {
      return { ok: false, code: "channel_not_ready", error: "Channel missing phone_number_id." };
    }
    if (!contact.phone) {
      return { ok: false, code: "contact_missing_handle", error: "Contact has no phone." };
    }
    const payload =
      type === "template" && template
        ? {
            messaging_product: "whatsapp",
            to: contact.phone,
            type: "template",
            template: {
              name: template.name,
              language: { code: template.language },
              components: template.components ?? [],
            },
          }
        : type === "image" && media
          ? {
              messaging_product: "whatsapp",
              to: contact.phone,
              type: "image",
              image: { link: media.url, caption: content?.trim() ?? undefined },
            }
          : {
              messaging_product: "whatsapp",
              to: contact.phone,
              type: "text",
              text: { body: content!.trim() },
            };
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.phone_number_id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const json = (await res.json().catch(() => null)) as
      | { messages?: Array<{ id: string }>; error?: { message: string } }
      | null;
    if (!res.ok || json?.error) {
      return { ok: false, code: "provider_error", error: json?.error?.message ?? `Meta HTTP ${res.status}` };
    }
    return { ok: true, providerMessageId: json?.messages?.[0]?.id ?? null };
  }

  if (channel.type === "instagram") {
    if (!contact.instagram_id) {
      return { ok: false, code: "contact_missing_handle", error: "Contact has no instagram_id." };
    }
    const meta = (channel.metadata ?? {}) as { ig_login_user_id?: string };
    const igUserId = channel.page_id ? null : meta.ig_login_user_id ?? channel.ig_business_account_id;
    const url = channel.page_id
      ? `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.page_id}/messages`
      : `https://graph.instagram.com/${META_GRAPH_VERSION}/${igUserId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: contact.instagram_id },
        messaging_type: "RESPONSE",
        message: { text: content?.trim() ?? "" },
      }),
    });
    const json = (await res.json().catch(() => null)) as
      | { message_id?: string; error?: { message: string } }
      | null;
    if (!res.ok || json?.error) {
      return { ok: false, code: "provider_error", error: json?.error?.message ?? `IG HTTP ${res.status}` };
    }
    return { ok: true, providerMessageId: json?.message_id ?? null };
  }

  if (channel.type === "telegram") {
    if (!contact.telegram_id) {
      return { ok: false, code: "contact_missing_handle", error: "Contact has no telegram_id." };
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: contact.telegram_id, text: content?.trim() ?? "" }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: { chat: { id: number }; message_id: number };
      description?: string;
    } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, code: "provider_error", error: json?.description ?? `Telegram HTTP ${res.status}` };
    }
    const tgKey = json.result ? `${json.result.chat.id}:${json.result.message_id}` : null;
    return { ok: true, providerMessageId: tgKey };
  }

  if (channel.type === "facebook") {
    if (!contact.messenger_id) {
      return { ok: false, code: "contact_missing_handle", error: "Contact has no messenger_id." };
    }
    if (!channel.page_id) {
      return { ok: false, code: "channel_misconfigured", error: "Channel missing page_id." };
    }
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.page_id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: contact.messenger_id },
          messaging_type: "RESPONSE",
          message: { text: content?.trim() ?? "" },
        }),
      },
    );
    const json = (await res.json().catch(() => null)) as
      | { message_id?: string; error?: { message: string } }
      | null;
    if (!res.ok || json?.error) {
      return { ok: false, code: "provider_error", error: json?.error?.message ?? `Messenger HTTP ${res.status}` };
    }
    return { ok: true, providerMessageId: json?.message_id ?? null };
  }

  return { ok: false, code: "unsupported_channel", error: `Send not implemented for ${channel.type} via REST API.` };
}
