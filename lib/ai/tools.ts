import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveContext } from "@/lib/ai/retrieval";
import { orgCalendarFreeBusy, orgCalendarCreateEvent } from "@/lib/calendar/connections";

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
  | "search_knowledge"
  | "check_availability"
  | "book_meeting";

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
  check_availability: {
    name: "check_availability",
    description:
      "Check the business calendar for busy/free times before proposing a meeting slot. Pass an absolute UTC window (use a 'Z' suffix). Returns the busy blocks in that window so you can offer a free slot. Call this before book_meeting.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        from_iso: { type: "string", description: "Window start, RFC3339 UTC e.g. 2026-06-20T08:00:00Z" },
        to_iso: { type: "string", description: "Window end, RFC3339 UTC e.g. 2026-06-20T18:00:00Z" },
      },
      required: ["from_iso", "to_iso"],
    },
  },
  book_meeting: {
    name: "book_meeting",
    description:
      "Book a meeting on the business calendar once the customer agrees a time. Give the local start time and the customer's time zone. The customer is added as an attendee automatically (don't ask for their email just to book — use what's on file). Confirm the slot is free first with check_availability.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", description: "Short meeting title, e.g. 'Demo call with Acme'" },
        start_local: { type: "string", description: "Local start time, no offset, e.g. 2026-06-20T15:00:00" },
        duration_minutes: { type: "number", description: "Length in minutes (default 30)" },
        time_zone: { type: "string", description: "IANA time zone of start_local, e.g. Europe/Madrid. Ask the customer if unsure." },
        description: { type: "string", description: "Optional agenda / notes" },
      },
      required: ["title", "start_local", "time_zone"],
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
  "check_availability",
  "book_meeting",
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
      return on(["capture_lead", "request_human_handoff", "check_availability", "book_meeting"]);
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
      case "check_availability":
        return await checkAvailability(input, ctx);
      case "book_meeting":
        return await bookMeeting(input, ctx);
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

// Strip any tz suffix → wall-clock naive, add minutes (DST-edge-naive, fine for
// a meeting length), return naive ISO (no offset). Date arithmetic in app code
// is allowed (the Date.now()/new Date() ban is workflow-scripts only).
function addMinutesNaive(localIso: string, minutes: number): string {
  const naive = localIso.replace(/(Z|[+-]\d{2}:?\d{2})$/, "");
  const d = new Date(`${naive}Z`);
  if (Number.isNaN(d.getTime())) return naive;
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().replace(/\.\d{3}Z$/, "");
}

async function checkAvailability(input: unknown, ctx: ToolExecContext): Promise<ToolResult> {
  const a = (input ?? {}) as Record<string, unknown>;
  const fromIso = asString(a.from_iso);
  const toIso = asString(a.to_iso);
  if (!fromIso || !toIso) {
    return { content: "Provide both from_iso and to_iso (RFC3339 UTC).", isError: true };
  }
  const busy = await orgCalendarFreeBusy(ctx.orgId, { fromIso, toIso });
  if (busy === null) {
    return {
      content:
        "No calendar is connected for this business, so I can't check live availability. Offer to take their preferred time and have a human confirm, or share a booking link.",
    };
  }
  if (busy.length === 0) {
    return { content: `The calendar is completely free between ${fromIso} and ${toIso}. Propose a time in that window.` };
  }
  const lines = busy.map((b) => `• busy ${b.startIso} → ${b.endIso}`).join("\n");
  return {
    content: `Busy blocks between ${fromIso} and ${toIso} (all other times are free — propose a slot that avoids these):\n${lines}`,
  };
}

async function bookMeeting(input: unknown, ctx: ToolExecContext): Promise<ToolResult> {
  const a = (input ?? {}) as Record<string, unknown>;
  const title = asString(a.title);
  const startLocal = asString(a.start_local);
  const timeZone = asString(a.time_zone);
  const description = asString(a.description);
  const durationRaw = typeof a.duration_minutes === "number" ? a.duration_minutes : 30;
  const duration = Math.min(480, Math.max(5, Math.round(durationRaw) || 30));
  if (!title || !startLocal || !timeZone) {
    return { content: "Need a title, a local start time, and the customer's time zone to book.", isError: true };
  }

  // Add the customer as an attendee from what's on file (never asked just to book).
  const { data: contact } = await ctx.admin
    .from("contacts")
    .select("email")
    .eq("id", ctx.contactId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  const attendeeEmails = contact?.email ? [contact.email as string] : [];

  const created = await orgCalendarCreateEvent(ctx.orgId, {
    title,
    description: description || undefined,
    startIso: startLocal,
    endIso: addMinutesNaive(startLocal, duration),
    timeZone,
    attendeeEmails,
  });
  if (created === null) {
    return {
      content:
        "I couldn't book it — no calendar is connected for this business. Confirm the customer's preferred time and tell them a teammate will lock it in.",
    };
  }
  return {
    content: `Booked "${title}" for ${startLocal} (${timeZone}), ${duration} min${attendeeEmails.length ? `, invite sent to ${attendeeEmails[0]}` : ""}.`,
    outcome: {
      type: "booking_created",
      payload: { duration_minutes: duration, time_zone: timeZone, invited: attendeeEmails.length > 0 },
    },
  };
}
