import { NextResponse } from "next/server";
import { getConversation } from "@/lib/mock-data";

// POST /api/ai/suggest-reply
// Stubbed for Week 2. Real bot-grounded suggestion ships in Week 7.
// Body: { conversation_id }
// Response: { text: string, model: "stub" }
export async function POST(req: Request) {
  let body: { conversation_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = body.conversation_id;
  if (!id) {
    return NextResponse.json({ error: "conversation_id required" }, { status: 400 });
  }
  const conv = getConversation(id);
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lastInbound = [...conv.messages].reverse().find((m) => m.direction === "inbound");
  const preview = lastInbound?.body.slice(0, 60) ?? "";

  await new Promise((r) => setTimeout(r, 500));
  return NextResponse.json({
    text: `Hi ${conv.contact.name.split(" ")[0]}! Thanks for your message — I'm looking into "${preview}…" right now and will get back to you shortly.`,
    model: "stub",
  });
}
