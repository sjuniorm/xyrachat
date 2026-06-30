import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const META_GRAPH_VERSION = "v22.0";

type SendBody = {
  conversationId: string;
  content?: string;
  type?: "text" | "template";
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
  repliedToMessageId?: string;
  // Client-supplied de-dupe token (stable across retries of the SAME send) so a
  // cross-tab resend or a client-timeout retry doesn't deliver the message twice.
  idempotencyKey?: string;
};

export async function POST(req: Request) {
  // 1. Auth — must be a signed-in agent (web session cookie OR mobile JWT).
  const { supabase, user } = await getRouteUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = await rateLimit("channel:send:whatsapp", user.id, { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down — too many messages." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { conversationId, content, type = "text" } = body;
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (type === "text" && !content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (type === "template" && !body.templateName?.trim()) {
    return NextResponse.json(
      { error: "templateName is required for template sends" },
      { status: 400 },
    );
  }

  // 2. Load conversation (RLS-scoped — agent must belong to the org).
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, contact_id, org_id, last_inbound_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Idempotency: if this exact send was already processed (same client token in
  // this conversation), return the stored message instead of sending again.
  // Guards cross-tab resends + client-timeout retries from double-delivering.
  if (body.idempotencyKey) {
    const { data: dup } = await supabase
      .from("messages")
      .select("id, wa_message_id")
      .eq("conversation_id", conv.id)
      .eq("metadata->>idempotency_key", body.idempotencyKey)
      .limit(1)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ message: dup, wa_message_id: dup.wa_message_id, idempotent: true });
    }
  }

  // 3. Load channel + contact (admin client; we've already RLS-verified org).
  const admin = createAdminClient();
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("id, type, phone_number_id, access_token_vault_id")
      .eq("id", conv.channel_id)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("id, phone")
      .eq("id", conv.contact_id)
      .maybeSingle(),
  ]);
  if (!channel || channel.type !== "whatsapp") {
    return NextResponse.json({ error: "Channel is not WhatsApp" }, { status: 400 });
  }
  if (!channel.phone_number_id || !channel.access_token_vault_id) {
    return NextResponse.json(
      { error: "Channel is missing phone_number_id or token" },
      { status: 400 },
    );
  }
  if (!contact?.phone) {
    return NextResponse.json({ error: "Contact has no phone" }, { status: 400 });
  }

  // 3b. WhatsApp 24-hour customer-service window (defense-in-depth — the web +
  // mobile composers also guard this, but the client is bypassable). Free text
  // is only delivered within 24h of the contact's last inbound; outside it Meta
  // silently drops it and the agent would see a false "sent". Templates are
  // always allowed. Mirrors /api/v1/messages + support/survey enforcement.
  if (type === "text") {
    const lastIn = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
    if (Date.now() - lastIn > 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        {
          error: "WhatsApp's 24-hour window is closed — send an approved template instead.",
          code: "wa_window_closed",
        },
        { status: 422 },
      );
    }
  }

  // 3c. Template sends must reference an APPROVED template on THIS channel —
  // don't trust the client's name/components blindly (clear error instead of an
  // opaque Meta rejection; RLS-scoped so it's org-safe).
  if (type === "template") {
    const { data: tpl } = await supabase
      .from("wa_templates")
      .select("id")
      .eq("channel_id", conv.channel_id)
      .eq("name", body.templateName)
      .eq("language", body.templateLanguage ?? "en_US")
      .eq("meta_status", "APPROVED")
      .is("deleted_at", null)
      .maybeSingle();
    if (!tpl) {
      return NextResponse.json(
        {
          error: "That template isn't an approved template on this channel.",
          code: "template_not_approved",
        },
        { status: 422 },
      );
    }
  }

  // 4. Decrypt the access token (service-role only).
  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) {
    return NextResponse.json({ error: "Token missing from vault" }, { status: 500 });
  }

  // 5. Call Meta Cloud API.
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.phone_number_id}/messages`;
  const wamPayload =
    type === "text"
      ? {
          messaging_product: "whatsapp",
          to: contact.phone,
          type: "text",
          text: { body: content!.trim() },
          ...(body.repliedToMessageId
            ? await buildContextFromRepliedTo(admin, body.repliedToMessageId, conv.id)
            : {}),
        }
      : {
          messaging_product: "whatsapp",
          to: contact.phone,
          type: "template",
          template: {
            name: body.templateName,
            language: { code: body.templateLanguage ?? "en_US" },
            components: body.templateComponents ?? [],
          },
        };

  const metaRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(wamPayload),
  });

  const metaJson = (await metaRes.json().catch(() => null)) as
    | { messages?: Array<{ id: string }>; error?: { message: string; code?: number } }
    | null;

  if (!metaRes.ok || metaJson?.error) {
    return NextResponse.json(
      {
        error: metaJson?.error?.message ?? `Meta API error (HTTP ${metaRes.status})`,
        meta: metaJson,
      },
      { status: 502 },
    );
  }

  const waMessageId = metaJson?.messages?.[0]?.id ?? null;

  // 6. Save the outbound message locally so the inbox updates immediately
  //    (Realtime + optimistic UI). Status updates land later via webhook.
  const { data: stored, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      // Templates store the variable-filled body text (the picker sends it as
      // `content`) so the inbox bubble shows the message instead of being blank.
      content: content?.trim() || null,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      wa_message_id: waMessageId,
      replied_to_message_id: body.repliedToMessageId ?? null,
      metadata: {
        ...(type === "template"
          ? { wa_template: { name: body.templateName ?? "", language: body.templateLanguage ?? "en_US" } }
          : {}),
        ...(body.idempotencyKey ? { idempotency_key: body.idempotencyKey } : {}),
      },
    })
    .select("*")
    .single();

  if (insertErr) {
    // Message was sent on WhatsApp but we couldn't store it — log and continue.
    console.error("[wa send] inserted to Meta but failed to save locally", insertErr);
  }

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  return NextResponse.json({ message: stored ?? null, wa_message_id: waMessageId });
}

async function buildContextFromRepliedTo(
  admin: ReturnType<typeof createAdminClient>,
  repliedToId: string,
  conversationId: string,
): Promise<Record<string, unknown>> {
  // Scope through the caller's conversation so a guessed UUID from
  // another org can't be reflected as a Meta context.message_id.
  const { data: replied } = await admin
    .from("messages")
    .select("wa_message_id")
    .eq("id", repliedToId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!replied?.wa_message_id) return {};
  return { context: { message_id: replied.wa_message_id } };
}
