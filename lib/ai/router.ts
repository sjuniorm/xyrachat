import "server-only";
import { getAnthropic, MODELS, isAnthropicConfigured } from "@/lib/ai/clients";

// =====================================================================
// Multi-bot intent routing. When more than one bot is assigned to a channel,
// a cheap Haiku call picks which one should handle the inbound, based on each
// bot's routing_description (falling back to its objective). The caller makes
// the choice sticky per conversation so it only runs ~once.
// =====================================================================

export type BotCandidate = {
  id: string;
  name: string;
  objective: string;
  routingDescription: string | null;
};

export type RouteResult = { botId: string; classifierTokens: number };

// Returns the chosen bot id + the tokens spent (0 when no classifier ran).
// Never throws — on any error / unconfigured AI it falls back to the first
// candidate so routing degrades to "the default bot" rather than going silent.
export async function classifyBot(params: {
  candidates: BotCandidate[];
  message: string;
}): Promise<RouteResult> {
  const { candidates, message } = params;
  if (candidates.length === 0) {
    return { botId: "", classifierTokens: 0 };
  }
  if (candidates.length === 1 || !message.trim() || !isAnthropicConfigured()) {
    return { botId: candidates[0].id, classifierTokens: 0 };
  }

  const list = candidates
    .map((c, i) => {
      const hint = c.routingDescription?.trim()
        ? c.routingDescription.trim()
        : `objective: ${c.objective}`;
      return `${i + 1}. ${c.name} — ${hint}`;
    })
    .join("\n");

  const system =
    "You route an incoming customer message to the single best assistant. " +
    "Reply with ONLY the number of the assistant. No words, no punctuation — just the digit.";
  const user =
    `Assistants:\n${list}\n\n` +
    `Customer message:\n"""${message.slice(0, 2000)}"""\n\n` +
    `Best assistant number:`;

  try {
    const anthropic = getAnthropic();
    const completion = await anthropic.messages.create({
      model: MODELS.rewrite, // Haiku — fast + cheap for classification
      max_tokens: 8,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = completion.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();
    const n = parseInt(text.match(/\d+/)?.[0] ?? "", 10);
    const tokens =
      completion.usage.input_tokens + completion.usage.output_tokens;
    const chosen =
      Number.isFinite(n) && n >= 1 && n <= candidates.length
        ? candidates[n - 1]
        : candidates[0];
    return { botId: chosen.id, classifierTokens: tokens };
  } catch (err) {
    console.warn("[router] classifyBot failed; using first candidate", err);
    return { botId: candidates[0].id, classifierTokens: 0 };
  }
}
