import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAnthropicConfigured } from "@/lib/ai/clients";
import { generateBotResponse, type BotRow, type ConversationMessage } from "@/lib/ai/chatbot";
import { checkAiQuota, consumeAiTokens } from "@/lib/billing/usage";

// POST /api/ai/suggest-reply
// Body: { conversation_id, extra_instruction? }
// Auth: signed-in agent in the conversation's org. Resolves the bot
// assigned to the conversation's channel and uses the same RAG +
// Claude pipeline as the live bot — but returns the suggestion to
// the agent instead of sending it.
export async function POST(req: Request) {
  let body: { conversation_id?: string; extra_instruction?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const conversationId = body.conversation_id;
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id required" }, { status: 400 });
  }

  // Auth (web cookie OR mobile JWT).
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No org" }, { status: 403 });
  }

  // Conversation must be in the user's org.
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, org_id, channel_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Conversation not in your org" }, { status: 403 });
  }

  // Find the bot assigned to this channel. If none → 404 so the UI can
  // show a helpful "assign a bot first" toast.
  const admin = createAdminClient();
  const { data: assignment } = await admin
    .from("bot_assignments")
    .select("bot_id, active")
    .eq("channel_id", conv.channel_id)
    .eq("active", true)
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json(
      { error: "NO_BOT_ASSIGNED", message: "Assign a bot to this channel first." },
      { status: 404 },
    );
  }

  const { data: bot } = await admin
    .from("bots")
    .select("*")
    .eq("id", assignment.bot_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bot) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  // Last 10 messages, oldest → newest. The most recent inbound is what
  // we're suggesting a reply TO.
  const { data: msgs } = await admin
    .from("messages")
    .select("direction, content, sender_type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(10);
  const ordered = ((msgs ?? []) as ConversationMessage[]).slice().reverse();
  const lastInbound = [...ordered].reverse().find((m) => m.direction === "inbound");
  if (!lastInbound?.content) {
    return NextResponse.json(
      { error: "No inbound message to reply to" },
      { status: 400 },
    );
  }

  // Read org name for the system prompt.
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", profile.org_id)
    .maybeSingle();

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const quota = await checkAiQuota(profile.org_id);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: "AI_QUOTA_EXCEEDED",
        message: "Your workspace has used all of its AI tokens for this month. Upgrade your plan to keep using Suggest Reply.",
        plan: quota.plan,
        tokens_used: quota.tokens_used_this_month,
        limit: quota.monthly_ai_tokens_limit,
      },
      { status: 402 },
    );
  }

  try {
    const result = await generateBotResponse({
      bot: bot as BotRow,
      orgName: org?.name ?? "the team",
      recentMessages: ordered,
      newMessage:
        body.extra_instruction
          ? `${lastInbound.content}\n\n[Agent note for you: ${body.extra_instruction}]`
          : lastInbound.content,
    });

    await consumeAiTokens(
      profile.org_id,
      result.usage.input_tokens + result.usage.output_tokens,
    );

    return NextResponse.json({
      text: result.response,
      suggestion: result.response,
      should_handoff: result.shouldHandoff,
      handoff_reason: result.handoffReason,
      sources_used: result.sourcesUsed,
      tokens_used: result.usage.input_tokens + result.usage.output_tokens,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      max_similarity: result.maxSimilarity,
      model: result.model,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Suggest failed" },
      { status: 502 },
    );
  }
}
