// Automation trigger + action shapes. Pure types, safe to import anywhere.
// Lives alongside the executor + server actions so the same vocabulary
// applies in the builder UI, the webhook handlers, and the DB JSONB.

export type TriggerType =
  | "ig_new_follower"
  | "ig_comment_keyword"
  | "ig_story_mention"
  | "ig_dm_keyword"
  | "wa_keyword"
  | "tg_keyword"
  | "email_keyword"
  | "conversation_opened"
  | "webhook";

export type TriggerConfig = {
  // ig_comment_keyword / ig_dm_keyword / wa_keyword
  keywords?: string[];
  // ig_comment_keyword — optional pinning to a specific post
  post_id?: string | null;
  // Match mode for keywords. "any" matches a word boundary anywhere in
  // the message; "exact" matches the whole message after trim/lowercase.
  match?: "any" | "exact";
};

// Leaf actions — the "do something" steps. These can appear at the top level
// OR inside an if/else branch. They never nest (no wait/condition inside a
// branch), which keeps branch execution inline + bounded.
export type LeafAction =
  | { type: "send_dm"; text: string }
  | { type: "tag_contact"; tag: string }
  | { type: "assign_agent"; agent_id: string | null }
  | {
      type: "assign_smart";
      strategy: "round_robin" | "least_busy";
      // When true, only consider agents marked availability='online'.
      // Falls back to the same strategy across all agents if nobody is
      // online — beats failing silently when the team's off the clock.
      only_online?: boolean;
    }
  | { type: "webhook"; url: string; secret?: string }
  | { type: "add_to_sequence"; sequence_id: string }; // placeholder

// A single if/else condition. `tag` checks the contact's tags; `message`
// checks the triggering message text (merged into triggerData as message_text).
export type AutomationCondition =
  | { field: "tag"; op: "has" | "not_has"; value: string }
  | { field: "message"; op: "contains" | "not_contains"; value: string };

// Action variants. Discriminated union — the executor branches on `type`.
// Top-level actions add `wait` (timed delay) + `condition` (if/else) on top of
// the leaf actions. Branch arrays are LeafAction[] — TS enforces no nesting.
export type Action =
  | LeafAction
  | { type: "wait"; ms: number }
  | {
      type: "condition";
      match: "all" | "any";
      conditions: AutomationCondition[];
      then: LeafAction[];
      else: LeafAction[];
    };

// Evaluate if/else conditions against the contact's tags + the trigger message.
// Pure — the caller supplies the already-fetched tags + message text.
export function evaluateConditions(
  conditions: AutomationCondition[],
  match: "all" | "any",
  ctx: { tags: string[]; messageText: string },
): boolean {
  if (conditions.length === 0) return true; // no conditions → always "then"
  const tags = ctx.tags.map((t) => t.toLowerCase());
  const msg = ctx.messageText.toLowerCase();
  const results = conditions.map((c) => {
    if (c.field === "tag") {
      const has = tags.includes(c.value.trim().toLowerCase());
      return c.op === "has" ? has : !has;
    }
    const contains = c.value.trim() !== "" && msg.includes(c.value.trim().toLowerCase());
    return c.op === "contains" ? contains : !contains;
  });
  return match === "all" ? results.every(Boolean) : results.some(Boolean);
}

export type AutomationRow = {
  id: string;
  org_id: string;
  channel_id: string | null;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
  actions: Action[];
  active: boolean;
  run_count: number;
  success_count: number;
  failure_count: number;
  last_triggered_at: string | null;
  // Round-robin cursor for assign_smart with strategy='round_robin'.
  last_assigned_agent_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

// Substitutes {{contact_name}} / {{contact_phone}} / {{contact_email}} /
// {{first_name}} / {{username}} in action text. Missing values fall back
// to an empty string so we don't leave literal `{{...}}` braces in the
// outbound message.
export function renderTemplate(
  text: string,
  contact: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    instagram_id?: string | null;
  },
  extras?: Record<string, string | null | undefined>,
): string {
  const firstName = (contact.name ?? "").split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    contact_name: contact.name ?? "",
    first_name: firstName,
    contact_phone: contact.phone ?? "",
    contact_email: contact.email ?? "",
    username: contact.instagram_id ?? "",
    ...Object.fromEntries(
      Object.entries(extras ?? {}).map(([k, v]) => [k, v ?? ""]),
    ),
  };
  return text.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
}

// Lightweight keyword match. We do case-insensitive whole-word match by
// default (so "info" matches "Info" and "Need INFO please" but not
// "information"). Exact mode trims + lowercases both sides.
// Which trigger types a given channel type can hear. Used by the
// builder UI + the server-side validator. Pure data so it lives next to
// the rest of the type definitions (the actions module is `"use server"`
// which can't export non-async helpers).
export function allowedTriggersForChannel(channelType: string): TriggerType[] {
  switch (channelType) {
    case "instagram":
      return [
        "ig_new_follower",
        "ig_comment_keyword",
        "ig_story_mention",
        "ig_dm_keyword",
        "conversation_opened",
        "webhook",
      ];
    case "whatsapp":
      return ["wa_keyword", "conversation_opened", "webhook"];
    case "telegram":
      return ["tg_keyword", "conversation_opened", "webhook"];
    case "email":
      return ["email_keyword", "conversation_opened", "webhook"];
    default:
      return ["conversation_opened", "webhook"];
  }
}

export function matchesKeywords(
  text: string | null,
  config: TriggerConfig,
): boolean {
  if (!text) return false;
  const keywords = (config.keywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return false;
  const lower = text.toLowerCase();
  if (config.match === "exact") {
    const trimmed = lower.trim().replace(/[.!?,;:]+$/, "");
    return keywords.includes(trimmed);
  }
  // Word-boundary anywhere.
  for (const kw of keywords) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\W)${esc}(\\W|$)`, "i");
    if (re.test(lower)) return true;
  }
  return false;
}
