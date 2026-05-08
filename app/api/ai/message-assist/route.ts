import { NextResponse } from "next/server";

// POST /api/ai/message-assist
// Stubbed for Week 2. Real Claude-backed rewrite ships in Week 7.
// Body: { text, action, language?, conversation_id?, channel_id? }
// Response: { text: string, action: string, model: "stub" }
export async function POST(req: Request) {
  let body: {
    text?: string;
    action?: string;
    language?: string;
    conversation_id?: string;
    channel_id?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Empty text" }, { status: 400 });
  }

  // Crude mock transforms so the UI clearly reflects which action ran.
  // Replace with the real Claude call in Week 7.
  let rewritten = text;
  switch (body.action) {
    case "improve":
      rewritten = `${text}\n\n— refined for clarity.`;
      break;
    case "friendlier":
      rewritten = `Hey! ${text} 😊`;
      break;
    case "professional":
      rewritten = `Dear customer,\n\n${text}\n\nKind regards.`;
      break;
    case "shorter":
      rewritten = text.split(/[.!?]/).filter(Boolean).slice(0, 1).join(". ").trim() + ".";
      break;
    case "longer":
      rewritten = `${text}\n\nLet us know if there's anything else we can help with — happy to dig deeper.`;
      break;
    case "fix_grammar":
      rewritten = text.replace(/\bi\b/g, "I").replace(/\s+/g, " ");
      break;
    case "translate": {
      const lang = body.language ?? "en";
      rewritten = `[${lang}] ${text}`;
      break;
    }
    default:
      rewritten = text;
  }

  // Mock latency so the shimmer / loading state is visible.
  await new Promise((r) => setTimeout(r, 350));

  return NextResponse.json({
    text: rewritten,
    action: body.action ?? "noop",
    model: "stub",
    language: body.language ?? null,
  });
}
