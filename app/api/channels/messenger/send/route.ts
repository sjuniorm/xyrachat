import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { vaultReadSecret } from "@/lib/supabase/vault";

export const runtime = "nodejs";

const META_GRAPH_VERSION = "v22.0";

type SendBody = {
  conversationId: string;
  content?: string;
  repliedToMessageId?: string;
};

export async function POST(req: Request) {
  // 1. Auth (web cookie OR mobile JWT).
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("channel:send:messenger", user.id, { limit: 120, windowSec: 60 });
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
  const { conversationId, content } = body;
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  // 2. Load conversation (RLS-scoped).
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, contact_id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 3. Load channel + contact via admin (org already RLS-verified).
  const admin = createAdminClient();
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("id, type, page_id, access_token_vault_id")
      .eq("id", conv.channel_id)
      .maybeSingle(),
    admin.from("contacts").select("id, messenger_id").eq("id", conv.contact_id).maybeSingle(),
  ]);
  if (!channel || channel.type !== "facebook") {
    return NextResponse.json({ error: "Channel is not Messenger" }, { status: 400 });
  }
  if (!channel.page_id || !channel.access_token_vault_id) {
    return NextResponse.json({ error: "Channel is missing page_id or token" }, { status: 400 });
  }
  if (!contact?.messenger_id) {
    return NextResponse.json({ error: "Contact has no messenger_id" }, { status: 400 });
  }

  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return NextResponse.json({ error: "Token missing from vault" }, { status: 500 });

  // 4. Send via the Page's /messages endpoint.
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.page_id}/messages`;
  const metaRes = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: contact.messenger_id },
      messaging_type: "RESPONSE",
      message: { text: content!.trim() },
    }),
  });
  const metaJson = (await metaRes.json().catch(() => null)) as
    | { message_id?: string; error?: { message: string; code?: number } }
    | null;
  if (!metaRes.ok || metaJson?.error) {
    return NextResponse.json(
      { error: metaJson?.error?.message ?? `Meta API error (HTTP ${metaRes.status})`, meta: metaJson },
      { status: 502 },
    );
  }
  const messengerMessageId = metaJson?.message_id ?? null;

  // Scope replied-to through this conversation before FK'ing to it.
  let safeRepliedToId: string | null = null;
  if (body.repliedToMessageId) {
    const { data: replied } = await admin
      .from("messages")
      .select("id")
      .eq("id", body.repliedToMessageId)
      .eq("conversation_id", conv.id)
      .maybeSingle();
    safeRepliedToId = replied?.id ?? null;
  }

  const { data: stored, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      content: content!.trim(),
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      messenger_message_id: messengerMessageId,
      replied_to_message_id: safeRepliedToId,
      metadata: {},
    })
    .select("*")
    .single();
  if (insertErr) {
    console.error("[messenger send] sent to Meta but failed to save locally", insertErr);
  }

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  return NextResponse.json({ message: stored ?? null, messenger_message_id: messengerMessageId });
}
