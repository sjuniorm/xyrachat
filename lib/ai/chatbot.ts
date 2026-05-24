import "server-only";
import { getAnthropic, MODELS } from "@/lib/ai/clients";
import { retrieveContext } from "@/lib/ai/retrieval";

// Shape pulled from `bots` rows. Kept loose intentionally — most fields are
// JSONB and the bot CRUD UI lands in Week 8.
export type BotRow = {
  id: string;
  org_id: string;
  name: string;
  instructions: string | null;
  objective:
    | "support" | "lead_generation" | "website_traffic" | "sales"
    | "booking" | "qualification" | "custom";
  objective_config: Record<string, unknown>;
  tone: "friendly" | "professional" | "formal" | "casual" | "playful";
  personality: Record<string, unknown>;
  greeting_message: string | null;
  off_hours_message: string | null;
  business_hours: Record<string, unknown>;
  knowledge_threshold: number;
  language: string;
  behavior_rules: Record<string, unknown>;
  handoff_triggers: string[] | null;
  active: boolean;
};

export type ConversationMessage = {
  direction: "inbound" | "outbound";
  content: string | null;
  sender_type: "contact" | "agent" | "bot" | null;
};

export type BotUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

export type BotResult = {
  response: string;
  shouldHandoff: boolean;
  handoffReason: string | null;
  usage: BotUsage;
  sourcesUsed: string[];
  maxSimilarity: number;
  model: string;
};

// =====================================================================
// Top-level entry point: retrieve, gate on threshold, generate, parse.
// =====================================================================
export async function generateBotResponse(params: {
  bot: BotRow;
  orgName: string;
  recentMessages: ConversationMessage[];
  newMessage: string;
}): Promise<BotResult> {
  const { bot, orgName, recentMessages, newMessage } = params;

  // 1. Retrieve relevant knowledge.
  const retrieval = await retrieveContext(newMessage, bot.id, 5);

  // 2. Knowledge-gap handoff. If the bot HAS knowledge but none of it
  //    looks relevant to the question, escalate instead of risking a
  //    hallucination. If the bot has NO knowledge at all, we trust the
  //    system prompt + instructions to drive behavior — bots configured
  //    for chitchat / objective-driven flows don't always need a KB.
  //    Bot gate caller logs this to bot_outcomes.fallback_no_knowledge
  //    so analytics still catch the pattern.
  if (
    retrieval.chunks.length > 0 &&
    retrieval.maxSimilarity < bot.knowledge_threshold
  ) {
    const handoff =
      typeof bot.behavior_rules?.handoff_message === "string"
        ? (bot.behavior_rules.handoff_message as string)
        : "Let me get a teammate to help — one moment.";
    return {
      response: handoff,
      shouldHandoff: true,
      handoffReason: "knowledge_gap",
      usage: emptyUsage(),
      sourcesUsed: [],
      maxSimilarity: retrieval.maxSimilarity,
      model: MODELS.generation,
    };
  }

  // 3. Build the system prompt as TWO cacheable blocks: stable bot config
  //    in block 1, RAG chunks in block 2. Both get a 5-min ephemeral
  //    cache breakpoint. Across many requests in a conversation we expect
  //    80%+ cache hit on block 1 and a moderate rate on block 2.
  const systemConfig = buildSystemConfigBlock(bot, orgName);
  const systemKnowledge = buildKnowledgeBlock(retrieval.chunks);

  // 4. Last 10 messages as the conversation history Claude sees.
  const history = recentMessages
    .slice(-10)
    .map((m) => ({
      role:
        m.direction === "inbound"
          ? ("user" as const)
          : ("assistant" as const),
      content: m.content ?? "",
    }))
    .filter((m) => m.content.length > 0);

  // The new message is appended last. If we already have it as the final
  // inbound message in `recentMessages`, the caller can omit it from
  // `newMessage` — but defensively we still add when missing.
  const lastInHistory = history[history.length - 1];
  if (!lastInHistory || lastInHistory.role !== "user" || lastInHistory.content !== newMessage) {
    history.push({ role: "user", content: newMessage });
  }

  const anthropic = getAnthropic();
  const completion = await anthropic.messages.create({
    model: MODELS.generation,
    max_tokens: 1024,
    system: [
      { type: "text", text: systemConfig, cache_control: { type: "ephemeral" } },
      { type: "text", text: systemKnowledge, cache_control: { type: "ephemeral" } },
    ],
    messages: history,
  });

  // 5. Parse handoff. Claude is instructed to emit the literal token
  //    `[HANDOFF_REQUESTED]` when it can't or shouldn't continue. Also
  //    honor configured keyword triggers on the inbound text.
  const rawText = completion.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("\n")
    .trim();

  let shouldHandoff = rawText.includes("[HANDOFF_REQUESTED]");
  let handoffReason: string | null = shouldHandoff ? "model_requested" : null;
  if (!shouldHandoff && bot.handoff_triggers && bot.handoff_triggers.length > 0) {
    const lc = newMessage.toLowerCase();
    if (bot.handoff_triggers.some((kw) => kw && lc.includes(kw.toLowerCase()))) {
      shouldHandoff = true;
      handoffReason = "keyword_trigger";
    }
  }
  const cleanResponse = rawText.replace(/\[HANDOFF_REQUESTED\]/g, "").trim();

  return {
    response:
      cleanResponse ||
      (typeof bot.behavior_rules?.handoff_message === "string"
        ? (bot.behavior_rules.handoff_message as string)
        : "One moment — connecting you with someone."),
    shouldHandoff,
    handoffReason,
    usage: {
      input_tokens: completion.usage.input_tokens,
      output_tokens: completion.usage.output_tokens,
      cache_creation_input_tokens:
        completion.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: completion.usage.cache_read_input_tokens ?? 0,
    },
    sourcesUsed: Array.from(
      new Set(
        retrieval.chunks.map((c) => c.sourceTitle).filter((t): t is string => !!t),
      ),
    ),
    maxSimilarity: retrieval.maxSimilarity,
    model: MODELS.generation,
  };
}

// =====================================================================
// Prompt builders — kept in this file so it's obvious what Claude sees.
// =====================================================================

function emptyUsage(): BotUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

function objectiveBlock(
  objective: BotRow["objective"],
  config: Record<string, unknown>,
): string {
  switch (objective) {
    case "support":
      return "PRIMARY OBJECTIVE: support. Solve the user's question. Stay strictly on-topic. Never push sales. Escalate to a human if you can't resolve it within 2-3 turns.";
    case "lead_generation": {
      const fields = (config.fields as string[]) ?? ["name", "email"];
      const cta = (config.cta as string) ?? "";
      return `PRIMARY OBJECTIVE: lead_generation. Goal — collect ${fields.join(", ")}. Ask for them naturally across the conversation, not all at once. Confirm each value back. Never end without attempting at least the contact fields.${cta ? ` CTA: ${cta}` : ""}`;
    }
    case "website_traffic": {
      const targets = JSON.stringify(config.target_urls ?? []);
      const primary = config.primary_url ?? "";
      return `PRIMARY OBJECTIVE: website_traffic. Naturally guide the user toward the most relevant page on our site. Available links: ${targets}. Only share a link when it genuinely helps answer the question.${primary ? ` Primary destination: ${primary}.` : ""}`;
    }
    case "sales": {
      const catalog = config.catalog_url ?? "";
      const checkout = config.checkout_url ?? "";
      return `PRIMARY OBJECTIVE: sales. Identify the user's need, recommend fitting products from ${catalog}, and drive toward ${checkout}. Highlight value, not pressure. Never invent prices or stock — defer to the catalog or hand off.`;
    }
    case "booking": {
      const booking = config.booking_url ?? "";
      const qualifiers = JSON.stringify(config.qualifier_questions ?? []);
      return `PRIMARY OBJECTIVE: booking. Qualify the user's intent with: ${qualifiers}. Once qualified, share ${booking} and confirm they have what they need to book. Don't try to take the booking inside chat.`;
    }
    case "qualification": {
      const questions = JSON.stringify(config.questions ?? []);
      const scoring = JSON.stringify(config.scoring ?? {});
      const threshold = config.handoff_threshold ?? 0.7;
      return `PRIMARY OBJECTIVE: qualification. Walk the user through these questions in order: ${questions}. Score per ${scoring}. If score >= ${threshold}, respond with [HANDOFF_REQUESTED] and a short qualified-lead summary.`;
    }
    case "custom":
      return `PRIMARY OBJECTIVE: ${(config.goal_text as string) ?? "as instructed"}`;
  }
}

function toneBlock(tone: BotRow["tone"]): string {
  switch (tone) {
    case "friendly":
      return "TONE: friendly — warm, conversational, contractions OK.";
    case "professional":
      return "TONE: professional — polished and clear; light contractions OK.";
    case "formal":
      return "TONE: formal — complete sentences, no contractions, address the user respectfully.";
    case "casual":
      return "TONE: casual — relaxed and natural, like texting a colleague.";
    case "playful":
      return "TONE: playful — light, witty where appropriate, but never at the user's expense.";
  }
}

function personalityBlock(p: Record<string, unknown>): string {
  const emoji = (p.emoji_usage as string) ?? "subtle";
  const length = (p.response_length as string) ?? "balanced";
  const lengthHint =
    length === "short"
      ? "1-2 sentences"
      : length === "detailed"
        ? "a short paragraph"
        : "2-4 sentences";
  const signature = p.signature ? `\n- Sign messages as: ${p.signature}` : "";
  return `PERSONALITY:
- Emoji usage: ${emoji}
- Response length target: ${length} (${lengthHint})${signature}`;
}

function rulesBlock(rules: Record<string, unknown>): string {
  const lines: string[] = [];
  if (Array.isArray(rules.never_say)) {
    lines.push(`- Never say: ${(rules.never_say as string[]).join(", ")}`);
  }
  if (Array.isArray(rules.always_do)) {
    lines.push(`- Always: ${(rules.always_do as string[]).join("; ")}`);
  }
  if (lines.length === 0) return "";
  return `BEHAVIOR RULES:\n${lines.join("\n")}`;
}

function buildSystemConfigBlock(bot: BotRow, orgName: string): string {
  const pieces: string[] = [
    `You are ${bot.name}, an AI assistant for ${orgName}.`,
    "",
  ];
  if (bot.instructions) {
    pieces.push("INSTRUCTIONS:", bot.instructions, "");
  }
  pieces.push(objectiveBlock(bot.objective, bot.objective_config), "");
  pieces.push(toneBlock(bot.tone), "");
  pieces.push(personalityBlock(bot.personality), "");
  pieces.push(`LANGUAGE: respond in ${bot.language} unless the user clearly switches.`, "");
  const rules = rulesBlock(bot.behavior_rules);
  if (rules) pieces.push(rules, "");
  pieces.push(
    "IMPORTANT:",
    "- Ground factual answers in the knowledge base below. If a fact isn't there, say so honestly and either ask a clarifying question or hand off.",
    "- Never invent information (prices, availability, policies, dates).",
    "- If the user asks for a human, seems frustrated, or matches a handoff trigger, respond with exactly: [HANDOFF_REQUESTED]",
    "- Stay aligned with PRIMARY OBJECTIVE on every turn.",
  );
  return pieces.join("\n");
}

function buildKnowledgeBlock(
  chunks: Array<{ text: string; similarity: number; sourceTitle: string | null }>,
): string {
  if (chunks.length === 0) {
    return "KNOWLEDGE BASE:\n(no relevant knowledge retrieved)";
  }
  const body = chunks
    .map((c, i) => {
      const title = c.sourceTitle ? ` — ${c.sourceTitle}` : "";
      return `[chunk ${i + 1}${title}]\n${c.text}`;
    })
    .join("\n\n");
  return `KNOWLEDGE BASE:\n${body}`;
}
