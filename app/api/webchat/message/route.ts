import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { runBotGate } from "@/lib/ai/bot-gate";
import { emit } from "@/lib/api/emit";
import { notifyNewInbound } from "@/lib/push/notify";
import {
  WEBCHAT_CORS,
  isWebchatKey,
  resolveWebchatChannel,
  resolveVisitor,
} from "@/lib/webchat/server";

export const runtime = "nodejs";

const MAX_CONTENT = 4000;
const VISITOR_RE = /^[A-Za-z0-9_-]{8,100}$/;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: WEBCHAT_CORS });
}

type Body = { k?: string; visitorId?: string; content?: string; visitorName?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: WEBCHAT_CORS });
  }
  const { k, visitorId } = body;
  const content = (body.content ?? "").trim();

  if (!isWebchatKey(k)) {
    return NextResponse.json({ error: "Bad key" }, { status: 400, headers: WEBCHAT_CORS });
  }
  if (!visitorId || !VISITOR_RE.test(visitorId)) {
    return NextResponse.json({ error: "Bad visitor" }, { status: 400, headers: WEBCHAT_CORS });
  }
  if (!content) {
    return NextResponse.json({ error: "Empty message" }, { status: 400, headers: WEBCHAT_CORS });
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json({ error: "Message too long" }, { status: 413, headers: WEBCHAT_CORS });
  }

  // Anti-abuse: a public endpoint that creates contacts/messages. Throttle per
  // (channel, visitor) and per channel. Fails open until Upstash is set.
  const perVisitor = await rateLimit("webchat:msg", `${k}:${visitorId}`, { limit: 20, windowSec: 60 });
  if (!perVisitor.ok) {
    return NextResponse.json(
      { error: "Slow down" },
      { status: 429, headers: { ...WEBCHAT_CORS, "Retry-After": String(perVisitor.retryAfter) } },
    );
  }
  const perChannel = await rateLimit("webchat:msg:ch", k, { limit: 600, windowSec: 60 });
  if (!perChannel.ok) {
    return NextResponse.json({ error: "Busy" }, { status: 429, headers: WEBCHAT_CORS });
  }

  const channel = await resolveWebchatChannel(k);
  if (!channel) {
    return NextResponse.json({ error: "Unknown channel" }, { status: 404, headers: WEBCHAT_CORS });
  }

  const resolved = await resolveVisitor(channel, visitorId, body.visitorName);
  if (!resolved) {
    return NextResponse.json({ error: "Could not start chat" }, { status: 500, headers: WEBCHAT_CORS });
  }
  const { contactId, conversationId } = resolved;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: inserted, error } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direction: "inbound",
      content,
      sender_type: "contact",
      status: "sent",
      metadata: {},
      created_at: nowIso,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: "Send failed" }, { status: 500, headers: WEBCHAT_CORS });
  }

  await admin
    .from("conversations")
    .update({ last_message_at: nowIso, last_inbound_at: nowIso })
    .eq("id", conversationId);

  // Fan-out: outbound webhook event, agent push, and the bot gate (so a bot
  // assigned to this channel answers automatically). Bot gate runs awaited so
  // the reply is usually present by the time the widget next polls.
  void emit({
    type: "message.received",
    orgId: channel.org_id,
    data: {
      id: inserted.id,
      conversation_id: conversationId,
      contact_id: contactId,
      channel_id: channel.id,
      channel_type: "webchat",
      direction: "inbound",
      content,
      created_at: nowIso,
    },
  });
  void notifyNewInbound({ conversationId, channelType: "webchat", preview: content });
  try {
    await runBotGate({
      channel: { id: channel.id, type: "webchat", org_id: channel.org_id },
      conversationId,
      contactId,
      newMessage: { content, media_type: null, isFirstFromContact: false },
    });
  } catch {
    // bot failure must not break the visitor's send
  }

  return NextResponse.json({ ok: true, id: inserted.id }, { headers: WEBCHAT_CORS });
}
