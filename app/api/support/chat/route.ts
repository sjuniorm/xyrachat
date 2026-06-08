import { NextResponse, type NextRequest } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/support/chat — the in-app "Ask Xyra Helper" widget. Runs Xyra's OWN
// support bot (SUPPORT_BOT_ID, a bot in our operator org) against the user's
// question and returns the answer. Ephemeral (no DB write). Eating our own dog
// food: customers get help from the same bot engine they're paying for.
//
// Degrades gracefully: if no support bot is configured / quota is out / the
// model errors, it returns an "email us" fallback rather than failing. The
// support bot only knows OUR docs (RAG is scoped by bot_id), so there's no
// cross-org data exposure even though any signed-in user can call it.
const FALLBACK =
  "I can't answer right now — email support@xyrachat.com and our team will get back to you within 24 business hours.";

const SUPPORT_BOT_ID = process.env.SUPPORT_BOT_ID;

export async function POST(req: NextRequest) {
  const { user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("support:chat", user.id, { limit: 20, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { message?: string; history?: Array<{ role?: string; text?: string }> }
    | null;
  const message = String(body?.message ?? "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  if (!SUPPORT_BOT_ID) {
    return NextResponse.json({ configured: false, reply: FALLBACK });
  }

  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("*")
    .eq("id", SUPPORT_BOT_ID)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bot) return NextResponse.json({ configured: false, reply: FALLBACK });

  const { checkAiQuota, consumeAiTokens } = await import("@/lib/billing/usage");
  // Charges OUR operator org's AI budget (we pay for our own support bot).
  const quota = await checkAiQuota(bot.org_id);
  if (!quota.ok) return NextResponse.json({ configured: true, reply: FALLBACK });

  const { generateBotResponse } = await import("@/lib/ai/chatbot");
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", bot.org_id)
    .maybeSingle();

  const history = (Array.isArray(body?.history) ? body!.history! : [])
    .slice(-6)
    .map((h) => ({
      direction: h.role === "bot" ? ("outbound" as const) : ("inbound" as const),
      content: String(h.text ?? "").slice(0, 2000),
      sender_type: h.role === "bot" ? ("bot" as const) : ("contact" as const),
    }))
    .filter((h) => h.content);

  try {
    const result = await generateBotResponse({
      bot: bot as Parameters<typeof generateBotResponse>[0]["bot"],
      orgName: org?.name ?? "Xyra Chat",
      recentMessages: history,
      newMessage: message,
    });
    await consumeAiTokens(
      bot.org_id,
      result.usage.input_tokens + result.usage.output_tokens + result.embeddingTokens,
    );
    return NextResponse.json({
      configured: true,
      reply: result.response || FALLBACK,
      handoff: result.shouldHandoff,
    });
  } catch (err) {
    console.error("[support/chat] generate failed", err);
    return NextResponse.json({ configured: true, reply: FALLBACK });
  }
}
