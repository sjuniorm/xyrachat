import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveContext } from "@/lib/ai/retrieval";

// =====================================================================
// Bot tool use (Anthropic function calling).
//
// SECURITY CONTRACT (non-negotiable):
//   - Tool INPUT SCHEMAS declare ZERO identity fields. There is no way for
//     the model to even express an org_id / contact_id / conversation_id.
//   - executeTool() takes every id from the server-built ToolExecContext,
//     NEVER from the model's tool input. Every query is scoped to BOTH
//     ctx.contactId AND ctx.orgId (service_role bypasses RLS, so the org
//     filter is the tenant guard).
//   - executeTool() NEVER throws — a failed/invalid tool returns
//     { isError: true } so the loop feeds the error back to the model and
//     keeps going. The iteration cap lives in the chatbot loop.
// =====================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

export type ToolName =
  | "capture_lead"
  | "tag_contact"
  | "request_human_handoff"
  | "search_knowledge";

// Anthropic tool spec (structural — matches messages.create `tools` items).
export type ToolSpec = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

// Server-trusted context. Built by the bot gate AFTER the tenant guard
// (bot.org_id === channel.org_id is already proven there).
export type ToolExecContext = {
  admin: AdminClient;
  orgId: string;
  botId: string;
  conversationId: string;
  contactId: string;
};

export type ToolResult = {
  content: string; // text fed back to the model as the tool_result
  isError?: boolean;
  outcome?: { type: string; payload: Record<string, unknown> }; // → bot_outcomes
  handoff?: { reason: string }; // → conversation handoff in the gate
  sourceTitles?: string[]; // search_knowledge provenance
  embeddingTokens?: number; // OpenAI tokens to fold into the org AI budget
};

// ---------------------------------------------------------------------
// Definitions — NO identity fields anywhere in the input schemas.
// ---------------------------------------------------------------------
const SPECS: Record<ToolName, ToolSpec> = {
  capture_lead: {
    name: "capture_lead",
    description:
      "Save the customer's contact details onto their profile when they share them. Call this as soon as you learn a name, email, or phone — you don't need all three. Don't ask for everything at once.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", description: "Customer's name, if given" },
        email: { type: "string", description: "Email address, if given" },
        phone: { type: "string", description: "Phone number, if given" },
        note: { type: "string", description: "Short note on what the lead wants" },
      },
      required: [],
    },
  },
  tag_contact: {
    name: "tag_contact",
    description:
      "Add a short label to this customer for routing and segmentation (e.g. 'pricing', 'vip', 'spanish', 'demo-request'). Use a lowercase, 1-2 word tag.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        tag: { type: "string", description: "The tag to add (lowercase, 1-2 words)" },
      },
      required: ["tag"],
    },
  },
  request_human_handoff: {
    name: "request_human_handoff",
    description:
      "Escalate the conversation to a human teammate when the customer asks for a person, is frustrated, or you genuinely can't help. Give a brief reason.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string", description: "Why a human is needed" },
      },
      required: [],
    },
  },
  search_knowledge: {
    name: "search_knowledge",
    description:
      "Search the business knowledge base for facts before answering. Use this when the customer asks something specific you're not certain about. Returns the most relevant passages.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "What to look up" },
      },
      required: ["query"],
    },
  },
};

// Stable order so the Anthropic `tools` array (part of the cached prefix)
// doesn't churn between requests for the same bot config.
const TOOL_ORDER: ToolName[] = [
  "search_knowledge",
  "capture_lead",
  "tag_contact",
  "request_human_handoff",
];

// JSONB config is untyped at the DB boundary — narrow loosely here.
export function selectEnabledTools(toolsConfig: unknown): ToolSpec[] {
  const cfg = (toolsConfig ?? {}) as Record<string, { enabled?: boolean } | undefined>;
  return TOOL_ORDER.filter((n) => cfg[n]?.enabled).map((n) => SPECS[n]);
}

// Sensible per-objective defaults for NEW bots (createBot). Existing bots keep
// '{}' (no tools) so nothing changes for them.
export function defaultToolsConfig(
  objective: string,
): Record<string, { enabled: boolean }> {
  const on = (names: ToolName[]) =>
    Object.fromEntries(names.map((n) => [n, { enabled: true }]));
  switch (objective) {
    case "lead_generation":
    case "sales":
    case "qualification":
      return on(["capture_lead", "tag_contact", "request_human_handoff"]);
    case "booking":
      return on(["capture_lead", "request_human_handoff"]);
    case "support":
    default:
      return on(["request_human_handoff"]);
  }
}

// ---------------------------------------------------------------------
// Dispatcher — never throws.
// ---------------------------------------------------------------------
export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolExecContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "capture_lead":
        return await captureLead(input, ctx);
      case "tag_contact":
        return await tagContact(input, ctx);
      case "request_human_handoff":
        return requestHandoff(input);
      case "search_knowledge":
        return await searchKnowledge(input, ctx);
      default:
        return { content: `Unknown tool: ${name}.`, isError: true };
    }
  } catch (err) {
    console.warn("[tools] executeTool failed", { name, err });
    return {
      content: "That action failed to run. Continue helping the customer without it.",
      isError: true,
    };
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function captureLead(input: unknown, ctx: ToolExecContext): Promise<ToolResult> {
  const a = (input ?? {}) as Record<string, unknown>;
  const name = asString(a.name);
  const email = asString(a.email);
  const phone = asString(a.phone);
  const note = asString(a.note);
  if (!name && !email && !phone) {
    return {
      content: "No lead details provided — ask the customer for their name, email, or phone first.",
      isError: true,
    };
  }

  const { data: contact } = await ctx.admin
    .from("contacts")
    .select("id, name, email, phone, tags")
    .eq("id", ctx.contactId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!contact) {
    return { content: "Couldn't find the contact to save the lead.", isError: true };
  }

  // Fill only EMPTY contact fields. Never overwrite phone/email — phone is the
  // channel routing identity (used by the WhatsApp/Telegram send path).
  const tags = Array.from(new Set([...((contact.tags as string[]) ?? []), "lead"]));
  const patch: Record<string, unknown> = { tags };
  if (name && !contact.name) patch.name = name;
  if (email && !contact.email) patch.email = email;
  if (phone && !contact.phone) patch.phone = phone;

  const { error } = await ctx.admin
    .from("contacts")
    .update(patch)
    .eq("id", ctx.contactId)
    .eq("org_id", ctx.orgId);
  if (error) return { content: "Couldn't save the lead right now.", isError: true };

  // GDPR: don't duplicate raw PII into bot_outcomes (its contact_id FK is ON
  // DELETE SET NULL, so a payload copy would survive contact erasure). Store
  // only capture FLAGS — the contacts row is the single, erasable source of
  // truth and analytics can join on contact_id when it needs values.
  return {
    content: "Saved the customer's details.",
    outcome: {
      type: "lead_captured",
      payload: {
        captured_name: !!(name || contact.name),
        captured_email: !!(email || contact.email),
        captured_phone: !!(phone || contact.phone),
        has_note: !!note,
        via: "bot_tool",
      },
    },
  };
}

async function tagContact(input: unknown, ctx: ToolExecContext): Promise<ToolResult> {
  const a = (input ?? {}) as Record<string, unknown>;
  const tag = asString(a.tag).toLowerCase().replace(/\s+/g, " ").slice(0, 40);
  if (!tag) return { content: "No tag provided.", isError: true };

  const { data: contact } = await ctx.admin
    .from("contacts")
    .select("tags")
    .eq("id", ctx.contactId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!contact) {
    return { content: "Couldn't find the contact to tag.", isError: true };
  }
  const existing = (contact.tags as string[]) ?? [];
  if (existing.includes(tag)) {
    return { content: `Already tagged "${tag}".` };
  }
  const tags = Array.from(new Set([...existing, tag]));
  const { error } = await ctx.admin
    .from("contacts")
    .update({ tags })
    .eq("id", ctx.contactId)
    .eq("org_id", ctx.orgId);
  if (error) return { content: "Couldn't add the tag right now.", isError: true };
  // No bot_outcomes row — 'tag' isn't in the outcome enum; it rides in the
  // message's tools_invoked metadata instead.
  return { content: `Tagged the customer "${tag}".` };
}

function requestHandoff(input: unknown): ToolResult {
  const a = (input ?? {}) as Record<string, unknown>;
  const reason = asString(a.reason) || "the assistant requested a human";
  return {
    content: "Okay — a human teammate will take over from here.",
    handoff: { reason },
  };
}

async function searchKnowledge(input: unknown, ctx: ToolExecContext): Promise<ToolResult> {
  const a = (input ?? {}) as Record<string, unknown>;
  const query = asString(a.query);
  if (!query) return { content: "No search query provided.", isError: true };

  // botId is server-trusted; retrieveContext scopes results to this bot's
  // embeddings via match_embeddings(bot_id_param).
  const res = await retrieveContext(query, ctx.botId, 5);
  if (res.chunks.length === 0) {
    return { content: "No matching information found in the knowledge base." };
  }
  const body = res.chunks
    .map(
      (c, i) =>
        `[${i + 1}${c.sourceTitle ? " — " + c.sourceTitle : ""}] ${c.text}`,
    )
    .join("\n\n");
  const titles = Array.from(
    new Set(res.chunks.map((c) => c.sourceTitle).filter((t): t is string => !!t)),
  );
  return {
    content: "Knowledge base results:\n" + body,
    sourceTitles: titles,
    embeddingTokens: res.embeddingTokens,
  };
}
