import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { getAnthropic, isAnthropicConfigured, MODELS } from "@/lib/ai/clients";
import { checkAiQuota, consumeAiTokens } from "@/lib/billing/usage";

// Per-action system prompts. Each one is intentionally tight so the model
// returns just the rewrite — no preamble, no commentary.
const ACTION_PROMPTS: Record<string, (lang?: string) => string> = {
  improve: () =>
    "Rewrite the message below for clarity and natural flow. Keep meaning, tone, and language identical. Return ONLY the rewritten message, no preamble.",
  friendlier: () =>
    "Rewrite to feel warmer and more approachable while staying professional. Same language. Return only the rewrite.",
  professional: () =>
    "Rewrite in a polished, professional register. Same language. Return only the rewrite.",
  shorter: () =>
    "Tighten the message without losing meaning. Same language. Return only the rewrite.",
  longer: () =>
    "Expand the message with helpful detail. Same language. Don't invent facts. Return only the rewrite.",
  fix_grammar: () =>
    "Fix grammar and typos only. Do not change wording or tone. Return only the corrected message.",
  translate: (lang) =>
    `Translate the message to ${lang ?? "English"}. Preserve tone and any product names or proper nouns. Return only the translation.`,
};

// Per-channel hard limits. After generation, if the rewrite exceeds the
// channel's cap, we truncate at the last sentence boundary and report
// truncated=true so the UI can flag it.
const CHANNEL_MAX: Record<string, number> = {
  whatsapp: 4096,
  instagram: 1000,
  telegram: 4096,
  email: 100000,
};

type AssistAction = keyof typeof ACTION_PROMPTS;

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
  if (!text) return NextResponse.json({ error: "Empty text" }, { status: 400 });
  const action = body.action as AssistAction | undefined;
  if (!action || !(action in ACTION_PROMPTS)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Auth: must be a signed-in agent in some org (web cookie OR mobile JWT).
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("ai:message-assist", user.id, { limit: 20, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down — too many AI requests." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No org" }, { status: 403 });
  }

  // If the conversation_id is provided, verify it belongs to the same org
  // before we leak its prior messages into the prompt context.
  let priorContext = "";
  if (body.conversation_id) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, org_id")
      .eq("id", body.conversation_id)
      .maybeSingle();
    if (!conv || conv.org_id !== profile.org_id) {
      return NextResponse.json({ error: "Conversation not in your org" }, { status: 403 });
    }
    // Skip prior-context for translate — only meaningful for tone-based
    // actions where the surrounding voice matters.
    if (action !== "translate") {
      const admin = createAdminClient();
      const { data: msgs } = await admin
        .from("messages")
        .select("direction, content")
        .eq("conversation_id", body.conversation_id)
        .order("created_at", { ascending: false })
        .limit(5);
      const ordered = (msgs ?? []).reverse();
      if (ordered.length > 0) {
        priorContext =
          "PRIOR CONVERSATION CONTEXT (newest last) — use only to match voice, do not echo back:\n" +
          ordered
            .map((m) => {
              const who = m.direction === "inbound" ? "Customer" : "Agent";
              return `${who}: ${m.content ?? ""}`;
            })
            .join("\n") +
          "\n\n";
      }
    }
  }

  // Resolve channel max length (used to clamp output + hint Claude).
  let channelMax: number | null = null;
  if (body.channel_id) {
    const admin = createAdminClient();
    const { data: channel } = await admin
      .from("channels")
      .select("type, org_id")
      .eq("id", body.channel_id)
      .maybeSingle();
    if (channel && channel.org_id === profile.org_id) {
      channelMax = CHANNEL_MAX[channel.type] ?? null;
    }
  }

  // Bail with a clear error before calling Anthropic if the API key isn't
  // set — better than a 500 leaking the SDK exception.
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 },
    );
  }

  // AI quota gate. 402 ("Payment Required") is the conventional status
  // for billing-driven refusals — the UI can show an upgrade CTA.
  const quota = await checkAiQuota(profile.org_id);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: "AI_QUOTA_EXCEEDED",
        message: "Your workspace has used all of its AI tokens for this month. Upgrade your plan to keep using AI Assist.",
        plan: quota.plan,
        tokens_used: quota.tokens_used_this_month,
        limit: quota.monthly_ai_tokens_limit,
      },
      { status: 402 },
    );
  }

  const systemPrompt =
    priorContext +
    ACTION_PROMPTS[action](body.language) +
    (channelMax ? `\n\nHard limit: keep output ≤ ${channelMax} characters. Truncate gracefully if needed.` : "");

  // 2× input length is a reasonable cap for rewrites; hard-cap at 1024.
  const maxTokens = Math.min(1024, Math.max(256, Math.ceil(text.length / 2)));

  let rewritten = "";
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const anthropic = getAnthropic();
    const completion = await anthropic.messages.create({
      model: MODELS.rewrite,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    });
    rewritten = completion.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();
    inputTokens = completion.usage.input_tokens;
    outputTokens = completion.usage.output_tokens;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Anthropic call failed",
      },
      { status: 502 },
    );
  }

  // Charge the org's monthly budget for the tokens we just spent.
  await consumeAiTokens(profile.org_id, inputTokens + outputTokens);

  // Channel-length clamp. Cut at the last sentence boundary so the
  // truncation doesn't dangle mid-word.
  let truncated = false;
  if (channelMax && rewritten.length > channelMax) {
    truncated = true;
    const slice = rewritten.slice(0, channelMax);
    const lastBoundary = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? "),
      slice.lastIndexOf("\n"),
    );
    rewritten =
      lastBoundary > channelMax * 0.6
        ? slice.slice(0, lastBoundary + 1).trim()
        : slice.trim();
  }

  // Return the established { text } shape (composer reads .text) plus the
  // spec's extras for callers that want them.
  return NextResponse.json({
    text: rewritten,
    rewritten,
    action,
    language: body.language ?? null,
    model: MODELS.rewrite,
    tokens_used: inputTokens + outputTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    truncated,
  });
}
