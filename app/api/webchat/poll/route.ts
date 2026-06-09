import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { WEBCHAT_CORS, isWebchatKey, resolveWebchatChannel } from "@/lib/webchat/server";

export const runtime = "nodejs";

const VISITOR_RE = /^[A-Za-z0-9_-]{8,100}$/;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: WEBCHAT_CORS });
}

// GET ?k=&visitorId=&since=<iso> → outbound (agent/bot) messages after `since`.
// Read-only: never creates a contact/conversation (that's the message endpoint).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const visitorId = url.searchParams.get("visitorId");
  const since = url.searchParams.get("since");

  if (!isWebchatKey(k) || !visitorId || !VISITOR_RE.test(visitorId)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: WEBCHAT_CORS });
  }

  // Light throttle — polling is frequent but cheap.
  const rl = await rateLimit("webchat:poll", `${k}:${visitorId}`, { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json({ messages: [] }, { status: 200, headers: WEBCHAT_CORS });
  }

  const channel = await resolveWebchatChannel(k);
  if (!channel) {
    return NextResponse.json({ messages: [] }, { headers: WEBCHAT_CORS });
  }

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("org_id", channel.org_id)
    .eq("webchat_id", visitorId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return NextResponse.json({ messages: [] }, { headers: WEBCHAT_CORS });

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("channel_id", channel.id)
    .eq("contact_id", contact.id)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conv) return NextResponse.json({ messages: [] }, { headers: WEBCHAT_CORS });

  let q = admin
    .from("messages")
    .select("id, content, created_at")
    .eq("conversation_id", conv.id)
    .eq("direction", "outbound")
    // CRITICAL: never return internal staff notes to the visitor. Notes are
    // stored as outbound rows with is_internal_note=true on the SAME
    // conversation; without this filter they'd be delivered to the public
    // widget. Restrict to agent/bot sends too (defensive).
    .eq("is_internal_note", false)
    .in("sender_type", ["agent", "bot"])
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);
  if (since) q = q.gt("created_at", since);

  const { data: msgs } = await q;
  return NextResponse.json(
    {
      messages: (msgs ?? []).map((m) => ({ id: m.id, content: m.content, created_at: m.created_at })),
    },
    { headers: WEBCHAT_CORS },
  );
}
