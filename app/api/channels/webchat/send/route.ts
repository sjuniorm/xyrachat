import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type SendBody = { conversationId: string; content?: string; repliedToMessageId?: string };

// Agent reply on a webchat conversation. Unlike provider channels there's no
// outbound API call — we just store the row; the visitor's widget polls
// /api/webchat/poll and renders it.
export async function POST(req: Request) {
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("channel:send:webchat", user.id, { limit: 120, windowSec: 60 });
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
  const { conversationId } = body;
  const content = body.content?.trim();
  if (!conversationId) return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });

  // RLS-scoped: the conversation comes back only if it's the caller's org.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("type")
    .eq("id", conv.channel_id)
    .maybeSingle();
  if (!channel || channel.type !== "webchat") {
    return NextResponse.json({ error: "Channel is not webchat" }, { status: 400 });
  }

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
      content,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      replied_to_message_id: safeRepliedToId,
      metadata: {},
    })
    .select("*")
    .single();
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  return NextResponse.json({ message: stored ?? null });
}
