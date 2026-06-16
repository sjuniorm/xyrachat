import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { WEBCHAT_CORS, isWebchatKey, resolveWebchatChannel } from "@/lib/webchat/server";

export const runtime = "nodejs";

const VISITOR_RE = /^[A-Za-z0-9_-]{8,100}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: WEBCHAT_CORS });
}

// POST { k, visitorId, messageId, rating: 'up'|'down' } — the END CUSTOMER rates
// a bot reply in the webchat widget. Verifies the message is a BOT reply in a
// conversation owned by this visitor (contact) on this channel, then upserts the
// rating. One rating per (message, visitor); re-rating flips it.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { k?: string; visitorId?: string; messageId?: string; rating?: string }
    | null;
  const k = body?.k;
  const visitorId = body?.visitorId;
  const messageId = body?.messageId;
  const rating = body?.rating;

  if (
    !isWebchatKey(k) ||
    !visitorId ||
    !VISITOR_RE.test(visitorId) ||
    !messageId ||
    !UUID_RE.test(messageId) ||
    (rating !== "up" && rating !== "down")
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: WEBCHAT_CORS });
  }

  // Abuse throttle (per IP) — feedback is intentional + low-volume.
  const rl = await rateLimit("webchat:rate", `${k}:${clientIp(req)}`, { limit: 60, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: WEBCHAT_CORS });
  }

  const channel = await resolveWebchatChannel(k);
  if (!channel) return NextResponse.json({ error: "unknown" }, { status: 404, headers: WEBCHAT_CORS });

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("org_id", channel.org_id)
    .eq("webchat_id", visitorId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: "not_ratable" }, { status: 404, headers: WEBCHAT_CORS });

  // The message must be a genuine BOT reply…
  const { data: msg } = await admin
    .from("messages")
    .select("id, sender_type, direction, is_internal_note, metadata, conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.direction !== "outbound" || msg.sender_type !== "bot" || msg.is_internal_note) {
    return NextResponse.json({ error: "not_ratable" }, { status: 404, headers: WEBCHAT_CORS });
  }
  // …in a conversation that belongs to THIS visitor on THIS channel + org.
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("id", msg.conversation_id)
    .eq("channel_id", channel.id)
    .eq("contact_id", contact.id)
    .eq("org_id", channel.org_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "not_ratable" }, { status: 404, headers: WEBCHAT_CORS });

  const botId = (msg.metadata as { bot_id?: string } | null)?.bot_id ?? null;
  await admin.from("bot_reply_visitor_feedback").upsert(
    {
      org_id: channel.org_id,
      conversation_id: conv.id,
      message_id: messageId,
      bot_id: botId,
      rating,
      visitor_id: visitorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "message_id,visitor_id" },
  );

  return NextResponse.json({ ok: true }, { headers: WEBCHAT_CORS });
}
