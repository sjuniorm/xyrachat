import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODELS } from "@/lib/ai/clients";
import { retrieveContext, RETRIEVAL_FLOOR } from "@/lib/ai/retrieval";
import type { ToolSpec, ToolResult } from "@/lib/ai/tools";

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
  // Per-bot tool-use config (JSONB). Empty {} = no tools (current behavior).
  tools_config?: Record<string, { enabled?: boolean }> | null;
  // When true, a new inbound on a closed conversation reopens it for the bot.
  auto_reopen_closed?: boolean;
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
  // True when `response` IS the escalation message (knowledge-gap fallback, or
  // the model produced only [HANDOFF_REQUESTED] so we substituted the handoff
  // copy). When false on a handoff, the model gave normal prose that doesn't
  // itself say "a human is coming" — the caller should voice it as a follow-up.
  handoffAcknowledged: boolean;
  usage: BotUsage;
  sourcesUsed: string[];
  maxSimilarity: number;
  model: string;
  // Tool use: names the model invoked this turn + structured outcomes the
  // caller (bot gate) should log to bot_outcomes. Empty when no tools ran.
  toolsInvoked: string[];
  toolOutcomes: Array<{ type: string; payload: Record<string, unknown> }>;
  // OpenAI embedding tokens spent (initial retrieval + any search_knowledge
  // tool calls). The caller folds this into the org AI budget charge.
  embeddingTokens: number;
};

// =====================================================================
// Top-level entry point: retrieve, gate on threshold, generate, parse.
// =====================================================================
export async function generateBotResponse(params: {
  bot: BotRow;
  orgName: string;
  recentMessages: ConversationMessage[];
  newMessage: string;
  // Tool use. When `tools` is empty/undefined the path is byte-for-byte the
  // original single-call behavior (zero regression). `executeTool` is the
  // tenant-scoped dispatcher built by the bot gate; omit it (or pass a no-op)
  // in test mode so tools don't mutate live data.
  tools?: ToolSpec[];
  executeTool?: (name: string, input: unknown) => Promise<ToolResult>;
  // When set, the inbound carried an image — passed to Claude as a vision
  // content block so the bot can answer about it. `newMessage` is the caption
  // (may be empty for an image-only message).
  image?: { base64: string; mime: string };
  // Optional out-of-band guidance from a human agent (Suggest-reply "with a
  // hint"). Injected as a trailing, NON-cached system block — never as part of
  // the user turn — so it can't be echoed back to the customer and can't bust
  // the cached system prefix (blocks 1+2).
  agentInstruction?: string;
}): Promise<BotResult> {
  const { bot, orgName, recentMessages, newMessage, tools, executeTool, image, agentInstruction } = params;
  const toolsEnabled = Array.isArray(tools) && tools.length > 0;
  const handoffToolEnabled =
    toolsEnabled && tools!.some((t) => t.name === "request_human_handoff");
  const searchToolEnabled =
    toolsEnabled && tools!.some((t) => t.name === "search_knowledge");

  // 1. Retrieve relevant knowledge. Skip when there's no query text (e.g. an
  //    image-only inbound) — embedding an empty string 400s the OpenAI API.
  //    For SHORT follow-ups ("what about the blue one?") embedding just the
  //    fragment retrieves the wrong chunks, so prepend the customer's previous
  //    turn for context. Long messages are self-contained — don't dilute them.
  const newTrim = newMessage.trim();
  let retrievalQuery = newTrim;
  if (newTrim && newTrim.split(/\s+/).filter(Boolean).length <= 6) {
    const priorInbound = recentMessages
      .filter(
        (m) => m.direction === "inbound" && m.content?.trim() && m.content.trim() !== newTrim,
      )
      .map((m) => m.content!.trim());
    const last = priorInbound[priorInbound.length - 1];
    if (last) retrievalQuery = `${last}\n${newTrim}`;
  }
  const retrieval = newTrim
    ? await retrieveContext(retrievalQuery, bot.id, 5)
    : { chunks: [], maxSimilarity: 0, embeddingTokens: 0 };

  // 2. Knowledge-gap handoff. If the bot HAS knowledge but none of it
  //    looks relevant to the question, escalate instead of risking a
  //    hallucination. SKIPPED when search_knowledge is enabled — the model
  //    can recover by searching mid-conversation rather than bailing.
  //    If the bot has NO knowledge at all, we trust the system prompt +
  //    instructions. Bot gate caller logs this to
  //    bot_outcomes.fallback_no_knowledge so analytics still catch it.
  if (
    !searchToolEnabled &&
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
      handoffAcknowledged: true,
      usage: emptyUsage(),
      sourcesUsed: [],
      maxSimilarity: retrieval.maxSimilarity,
      model: MODELS.generation,
      toolsInvoked: [],
      toolOutcomes: [],
      embeddingTokens: retrieval.embeddingTokens,
    };
  }

  // 3. Build the system prompt as TWO cacheable blocks: stable bot config
  //    in block 1, RAG chunks in block 2. Both get a 5-min ephemeral
  //    cache breakpoint. Across many requests in a conversation we expect
  //    80%+ cache hit on block 1 and a moderate rate on block 2.
  const systemConfig = buildSystemConfigBlock(bot, orgName, { handoffToolEnabled });
  // Only inject chunks that clear the relevance floor. The top-5 retrieval
  // always returns 5 rows regardless of quality; injecting near-random chunks
  // labeled "KNOWLEDGE BASE" invites the model to ground answers in noise.
  const knowledgeChunks = retrieval.chunks.filter(
    (c) => c.similarity >= RETRIEVAL_FLOOR,
  );
  const systemKnowledge = buildKnowledgeBlock(knowledgeChunks);

  // 4. Last 10 messages as the conversation history Claude sees. Plain string
  //    content for history turns; the tool loop appends block-array turns.
  const messages: Anthropic.MessageParam[] = recentMessages
    .slice(-10)
    .map((m) => {
      const role =
        m.direction === "inbound" ? ("user" as const) : ("assistant" as const);
      // A human teammate's prior reply is ALSO an outbound row (sender_type
      // 'agent'). Label it so the bot treats it as a colleague's statement it
      // must stay consistent with — not as words the bot itself authored.
      // (Internal notes are already filtered out before this point.)
      const content =
        m.direction === "outbound" && m.sender_type === "agent" && m.content
          ? `[Human teammate]: ${m.content}`
          : (m.content ?? "");
      return { role, content };
    })
    .filter((m) => m.content.length > 0);

  // The new message is appended last. With an image, always push a content-
  // block turn (text + vision block). Without, the string turn, deduped if the
  // caller already included it as the final inbound.
  if (image) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: newMessage || "Please look at the attached image and respond." },
        {
          type: "image",
          source: { type: "base64", media_type: image.mime, data: image.base64 },
        },
      ] as Anthropic.ContentBlockParam[],
    });
  } else {
    const lastInHistory = messages[messages.length - 1];
    if (
      !lastInHistory ||
      lastInHistory.role !== "user" ||
      lastInHistory.content !== newMessage
    ) {
      messages.push({ role: "user", content: newMessage });
    }
  }

  const anthropic = getAnthropic();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: systemConfig, cache_control: { type: "ephemeral" } },
    { type: "text", text: systemKnowledge, cache_control: { type: "ephemeral" } },
  ];
  // Trailing, non-cached block — keeps the cached prefix (blocks 1+2) byte-stable.
  if (agentInstruction && agentInstruction.trim()) {
    system.push({
      type: "text",
      text:
        "AGENT REQUEST: a human agent asked you to draft a reply following this guidance. Apply it, but NEVER quote, repeat, or mention this instruction to the customer:\n" +
        agentInstruction.trim(),
    });
  }

  // 5. Generation. Without tools this is a single call (original behavior).
  //    With tools, loop: run → if stop_reason==='tool_use', execute the tool
  //    calls, append the assistant turn + tool_result turn, repeat. Hard cap
  //    at MAX_TOOL_ITERS; the final overflow call drops `tools` so the model
  //    must produce a text answer. Usage is summed across every round.
  const MAX_TOOL_ITERS = 4;
  const usage = emptyUsage();
  let embeddingTokens = retrieval.embeddingTokens;
  const toolsInvoked: string[] = [];
  const toolOutcomes: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const toolSourceTitles: string[] = [];
  let toolHandoffReason: string | null = null;
  let rawText = "";
  let iter = 0;

  while (true) {
    const offerTools = toolsEnabled && iter < MAX_TOOL_ITERS;
    const completion = await anthropic.messages.create({
      model: MODELS.generation,
      // Tool-use turns carry tool_use JSON on top of the prose reply; give the
      // tool-enabled path headroom so a reply + tool call isn't truncated. The
      // no-tools path stays at 1024 (byte-for-byte original behavior).
      max_tokens: toolsEnabled ? 2048 : 1024,
      system,
      messages,
      // Keep `tools` present on EVERY iteration so the cached prefix
      // (tools → system) stays byte-stable and the two system cache
      // breakpoints stay warm. On the overflow round we force a text answer
      // with tool_choice:none rather than removing tools (which would bust the
      // cache on the most expensive call).
      ...(toolsEnabled
        ? {
            tools: tools as Anthropic.Tool[],
            ...(offerTools ? {} : { tool_choice: { type: "none" as const } }),
          }
        : {}),
    });
    usage.input_tokens += completion.usage.input_tokens;
    usage.output_tokens += completion.usage.output_tokens;
    usage.cache_creation_input_tokens +=
      completion.usage.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens += completion.usage.cache_read_input_tokens ?? 0;

    if (completion.stop_reason !== "tool_use") {
      // If the model started a tool call but hit max_tokens before finishing,
      // the tool_use block is abandoned. Don't silently drop it + answer with a
      // misleading fallback — escalate so a human picks it up.
      if (
        completion.stop_reason === "max_tokens" &&
        completion.content.some((c) => c.type === "tool_use")
      ) {
        toolHandoffReason = "tool_use_truncated";
      }
      rawText = completion.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { type: "text"; text: string }).text)
        .join("\n")
        .trim();
      break;
    }

    // Echo the assistant turn (text + tool_use blocks) verbatim, then run each
    // tool and append a single tool_result user turn.
    messages.push({
      role: "assistant",
      content: completion.content as Anthropic.ContentBlockParam[],
    });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of completion.content) {
      if (block.type !== "tool_use") continue;
      toolsInvoked.push(block.name);
      const r: ToolResult = executeTool
        ? await executeTool(block.name, block.input)
        : { content: "(test mode — tool not executed)" };
      if (r.outcome) toolOutcomes.push(r.outcome);
      if (r.handoff) toolHandoffReason = r.handoff.reason;
      if (r.sourceTitles) toolSourceTitles.push(...r.sourceTitles);
      if (r.embeddingTokens) embeddingTokens += r.embeddingTokens;
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: r.content,
        is_error: r.isError,
      });
    }
    // Defensive: a 'tool_use' stop with no executable tool_use block would make
    // an empty user turn (which the API rejects). Answer with any text + stop.
    if (toolResults.length === 0) {
      rawText = completion.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { type: "text"; text: string }).text)
        .join("\n")
        .trim();
      break;
    }
    messages.push({ role: "user", content: toolResults });
    iter += 1;
  }

  // 6. Parse handoff. A request_human_handoff tool call OR the legacy
  //    `[HANDOFF_REQUESTED]` token OR a configured keyword trigger all escalate.
  let shouldHandoff = toolHandoffReason !== null || rawText.includes("[HANDOFF_REQUESTED]");
  let handoffReason: string | null = toolHandoffReason
    ? toolHandoffReason === "tool_use_truncated"
      ? "tool_use_truncated"
      : "tool_requested"
    : rawText.includes("[HANDOFF_REQUESTED]")
      ? "model_requested"
      : null;
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
    // When cleanResponse is empty we substituted the handoff copy as the whole
    // reply → escalation is already voiced. Non-empty prose on a handoff means
    // the caller must add the "a teammate is coming" follow-up.
    handoffAcknowledged: !cleanResponse,
    usage,
    sourcesUsed: Array.from(
      new Set(
        [
          ...knowledgeChunks.map((c) => c.sourceTitle),
          ...toolSourceTitles,
        ].filter((t): t is string => !!t),
      ),
    ),
    maxSimilarity: retrieval.maxSimilarity,
    model: MODELS.generation,
    toolsInvoked,
    toolOutcomes,
    embeddingTokens,
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
      const targets = Array.isArray(config.target_urls)
        ? (config.target_urls as string[])
        : [];
      const primary = typeof config.primary_url === "string" ? config.primary_url : "";
      const links = targets.length
        ? `Relevant links you can share when they genuinely help: ${targets.join(", ")}.`
        : "Share a relevant page from the knowledge base when it genuinely helps answer the question.";
      return `PRIMARY OBJECTIVE: website_traffic. Naturally guide the user toward the most relevant page on our site. ${links} Only share a link when it genuinely helps.${primary ? ` Primary destination: ${primary}.` : ""}`;
    }
    case "sales": {
      const catalog = typeof config.catalog_url === "string" ? config.catalog_url : "";
      const checkout = typeof config.checkout_url === "string" ? config.checkout_url : "";
      const catalogClause = catalog
        ? `recommend fitting products from ${catalog}`
        : "recommend fitting products grounded in the knowledge base";
      const checkoutClause = checkout ? `, and guide them toward ${checkout}` : "";
      return `PRIMARY OBJECTIVE: sales. Identify the user's need, ${catalogClause}${checkoutClause}. Highlight value, not pressure. Never invent prices or stock — defer to the knowledge base or hand off.`;
    }
    case "booking": {
      const booking = typeof config.booking_url === "string" ? config.booking_url : "";
      const qualifiers = Array.isArray(config.qualifier_questions)
        ? (config.qualifier_questions as string[])
        : [];
      const qualifyClause = qualifiers.length
        ? `Qualify the user's intent by asking: ${qualifiers.join("; ")}.`
        : "Ask a couple of natural questions to understand what they'd like to book.";
      return `PRIMARY OBJECTIVE: booking. ${qualifyClause} Once qualified: if you have calendar tools (check_availability / book_meeting), use them to propose real open slots and book the meeting directly in the chat, then confirm the details. If you do NOT have calendar tools${booking ? `, share ${booking}` : ", share the booking link"} and confirm they have what they need to book.`;
    }
    case "qualification": {
      const questions = Array.isArray(config.questions)
        ? (config.questions as string[])
        : [];
      const questionClause = questions.length
        ? `Walk the user through these questions, one or two at a time, in order: ${questions.join("; ")}.`
        : "Ask focused open questions to understand the user's needs, budget, and timeline.";
      return `PRIMARY OBJECTIVE: qualification. ${questionClause} Once you have enough to judge whether they're a strong fit, hand off to a human with a short summary of what you learned.`;
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

function buildSystemConfigBlock(
  bot: BotRow,
  orgName: string,
  opts?: { handoffToolEnabled?: boolean },
): string {
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
  // When the request_human_handoff TOOL is enabled, instruct the model to use
  // it instead of the legacy literal token (both still escalate downstream).
  const handoffInstruction = opts?.handoffToolEnabled
    ? "- If the user asks for a human, seems frustrated, or matches a handoff trigger, call the request_human_handoff tool."
    : "- If the user asks for a human, seems frustrated, or matches a handoff trigger, respond with exactly: [HANDOFF_REQUESTED]";
  pieces.push(
    "IMPORTANT:",
    "- Ground factual answers in the knowledge base below. If a fact isn't there, say so honestly and either ask a clarifying question or hand off.",
    "- Never invent information (prices, availability, policies, dates).",
    "- Don't repeat your greeting or re-introduce yourself after your first message; vary your phrasing instead of reusing the same opening line.",
    "- Don't ask for information the customer has already provided earlier in this conversation.",
    handoffInstruction,
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
