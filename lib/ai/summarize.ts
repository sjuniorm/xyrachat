import "server-only";
import { getAnthropic, MODELS, isAnthropicConfigured } from "@/lib/ai/clients";

export type ConversationSummary = {
  summary: string;
  tags: string[];
  inputTokens: number;
  outputTokens: number;
};

const SYSTEM = `You summarize a customer-support conversation for an agent.
Return ONLY a JSON object, no prose, no markdown fences:
{"summary": "<2-3 sentence summary of what the customer wanted and the outcome>",
 "tags": ["<1-5 short lowercase topic tags, e.g. billing, refund, bug, lead>"]}
Be factual and concise. Tags are single words or short hyphenated phrases.`;

// Build a summary + suggested tags from a conversation transcript via Haiku.
// Returns null if Anthropic isn't configured. The caller charges the token
// budget with input/output tokens.
export async function buildConversationSummary(
  messages: Array<{ direction: string; content: string | null; sender_type?: string | null }>,
): Promise<ConversationSummary | null> {
  if (!isAnthropicConfigured()) return null;

  const transcript = messages
    .filter((m) => m.content?.trim())
    .map((m) => {
      const who = m.direction === "inbound" ? "Customer" : m.sender_type === "bot" ? "Bot" : "Agent";
      return `${who}: ${m.content!.trim()}`;
    })
    .join("\n")
    .slice(0, 12000); // cap the prompt; recent context dominates anyway

  if (!transcript) return null;

  const anthropic = getAnthropic();
  const completion = await anthropic.messages.create({
    model: MODELS.rewrite,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content: transcript }],
  });
  const raw = completion.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("")
    .trim();

  let summary = raw;
  let tags: string[] = [];
  try {
    // Tolerate stray fences/text around the JSON.
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { summary?: unknown; tags?: unknown };
    if (typeof parsed.summary === "string") summary = parsed.summary.trim();
    if (Array.isArray(parsed.tags)) {
      tags = parsed.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase().slice(0, 32))
        .filter(Boolean)
        .slice(0, 5);
    }
  } catch {
    // Fall back to the raw text as the summary, no tags.
  }

  return {
    summary: summary.slice(0, 1000),
    tags,
    inputTokens: completion.usage.input_tokens,
    outputTokens: completion.usage.output_tokens,
  };
}
