import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";

export const runtime = "nodejs";

type SendBody = {
  conversationId: string;
  content?: string;
  imageUrl?: string;
  repliedToMessageId?: string;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { conversationId, content, imageUrl } = body;
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!content?.trim() && !imageUrl) {
    return NextResponse.json({ error: "content or imageUrl required" }, { status: 400 });
  }

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, contact_id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("id, type, access_token_vault_id")
      .eq("id", conv.channel_id)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("id, telegram_id")
      .eq("id", conv.contact_id)
      .maybeSingle(),
  ]);
  if (!channel || channel.type !== "telegram") {
    return NextResponse.json({ error: "Channel is not Telegram" }, { status: 400 });
  }
  if (!channel.access_token_vault_id) {
    return NextResponse.json({ error: "Channel missing token" }, { status: 400 });
  }
  if (!contact?.telegram_id) {
    return NextResponse.json({ error: "Contact has no telegram_id" }, { status: 400 });
  }

  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) {
    return NextResponse.json({ error: "Token missing from vault" }, { status: 500 });
  }

  // Telegram Bot API: send to chat_id == contact.telegram_id (their user id;
  // private chats use the user id as the chat id).
  const method = imageUrl ? "sendPhoto" : "sendMessage";
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const tgPayload: Record<string, unknown> = imageUrl
    ? { chat_id: contact.telegram_id, photo: imageUrl, caption: content?.trim() }
    : { chat_id: contact.telegram_id, text: content!.trim() };

  const tgRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tgPayload),
  });
  const tgJson = (await tgRes.json().catch(() => null)) as
    | {
        ok: boolean;
        result?: { message_id: number; chat: { id: number } };
        description?: string;
        error_code?: number;
      }
    | null;
  if (!tgRes.ok || !tgJson?.ok) {
    return NextResponse.json(
      {
        error: tgJson?.description ?? `Telegram API error (HTTP ${tgRes.status})`,
        telegram: tgJson,
      },
      { status: 502 },
    );
  }

  // Store the outbound row. We compose the same chat_id:message_id key the
  // inbound path uses, so a future read receipt or edit can find this row.
  const tgKey = tgJson.result
    ? `${tgJson.result.chat.id}:${tgJson.result.message_id}`
    : null;

  const { data: stored, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      content: content?.trim() ?? null,
      media_url: imageUrl ?? null,
      media_type: imageUrl ? "image" : null,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      telegram_message_id: tgKey,
      replied_to_message_id: body.repliedToMessageId ?? null,
      metadata: {},
    })
    .select("*")
    .single();
  if (insertErr) {
    console.error("[telegram send] sent but failed to save locally", insertErr);
  }

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  return NextResponse.json({
    message: stored ?? null,
    telegram_message_id: tgKey,
  });
}
