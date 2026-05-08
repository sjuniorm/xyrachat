import { NextResponse } from "next/server";
import { CONVERSATIONS, type Message } from "@/lib/mock-data";

// POST /api/ai/translate-inbound
// Stubbed for Week 2. Real translation ships in Week 7.
// Body: { message_id, target_language? }
// Response: { translation: { source_lang, target_lang, translated_text } }
export async function POST(req: Request) {
  let body: { message_id?: string; target_language?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mid = body.message_id;
  if (!mid) {
    return NextResponse.json({ error: "message_id required" }, { status: 400 });
  }

  // Find the message + its conversation for source-language detection.
  let found: { msg: Message; sourceLang: string } | null = null;
  for (const c of CONVERSATIONS) {
    const m = c.messages.find((x) => x.id === mid);
    if (m) {
      found = { msg: m, sourceLang: c.detected_language ?? "en" };
      break;
    }
  }
  if (!found) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const target = body.target_language ?? "en";

  await new Promise((r) => setTimeout(r, 350));
  return NextResponse.json({
    translation: {
      source_lang: found.sourceLang,
      target_lang: target,
      translated_text: `[${target}] ${found.msg.body}`,
    },
    model: "stub",
  });
}
