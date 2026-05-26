import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Save an internal note on a conversation. Stored as a message row with
// is_internal_note=true so it appears in the thread (via Realtime) but
// never goes out to a provider and never reaches the customer.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { conversationId?: string; content?: string };
  try {
    body = (await req.json()) as { conversationId?: string; content?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const conversationId = body.conversationId?.trim();
  const content = body.content?.trim();
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  // Verify the conversation belongs to the caller's org via RLS — we
  // can't write internal notes onto another org's conversation.
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: stored, error } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      content,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      is_internal_note: true,
      metadata: {},
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bump conversation's last_message_at so the inbox list reorders. We
  // do NOT touch last_inbound_at — internal notes don't reset the WA
  // 24-hour customer-service window.
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  return NextResponse.json({ message: stored });
}
