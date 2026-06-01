import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";

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
};

export async function POST(req: Request) {
  // 1. Auth — must be a signed-in agent (web session cookie OR mobile JWT).
  const { supabase, user } = await getRouteUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // 2. Load conversation (RLS-scoped — agent must belong to the org).
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, contact_id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
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
      content: type === "text" ? content!.trim() : null,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      wa_message_id: waMessageId,
      replied_to_message_id: body.repliedToMessageId ?? null,
      metadata:
        type === "template"
          ? {
              wa_template: {
                name: body.templateName ?? "",
                language: body.templateLanguage ?? "en_US",
              },
            }
          : {},
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
