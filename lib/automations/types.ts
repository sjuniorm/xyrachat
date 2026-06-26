// Automation trigger + action shapes. Pure types, safe to import anywhere.
// Lives alongside the executor + server actions so the same vocabulary
// applies in the builder UI, the webhook handlers, and the DB JSONB.

import type { BusinessHours } from "@/lib/bots/business-hours";

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
  // trigger_type 'webhook' — the shared secret an external system must send
  // (header X-Xyra-Secret or ?secret=) to POST /api/automations/:id/trigger.
  webhook_secret?: string;
  // Optional "active hours" gate: when present + active, the automation only
  // fires while `now` is inside one of these windows (in the schedule's
  // timezone). Checked in dispatchTrigger BEFORE the one-shot dedupe, so an
  // off-hours event doesn't consume a one-shot fire. Reuses the bot's shape.
  business_hours?: BusinessHours;
};

// Leaf actions — the "do something" steps. These can appear at the top level
// OR inside an if/else branch. They never nest (no wait/condition inside a
// branch), which keeps branch execution inline + bounded.
export type LeafAction =
  | { type: "send_dm"; text: string }
  // Public reply to the triggering Instagram comment (Comments API —
  // POST /{comment_id}/replies). Only meaningful on ig_comment_keyword (needs
  // the comment_id in triggerData); no-ops with an error otherwise.
  | { type: "reply_comment"; text: string }
  // Send a PERSISTENT link button (Instagram generic-template card with a
  // web_url button). Unlike quick replies, the card stays in the thread and can
  // be tapped again. Falls back to a plain-text "<text> <url>" send if the card
  // API call fails or on non-IG channels — so the link always arrives.
  | { type: "send_link_button"; text: string; url: string; label?: string }
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
  | { type: "add_to_sequence"; sequence_id: string }; // enroll into a drip sequence (047)

// A single if/else condition. `tag` checks the contact's tags; `message`
// checks the triggering/reply message text; `reply` branches on whether a
// preceding wait_for_reply got a reply or timed out (no value needed).
export type AutomationCondition =
  | { field: "tag"; op: "has" | "not_has"; value: string }
  | { field: "message"; op: "contains" | "not_contains"; value: string }
  | { field: "reply"; op: "received" | "timed_out"; value?: string };

// A single Instagram quick-reply button. Tapping it (a) opens the 24h messaging
// window (the tap is a user-initiated message) and (b) confirms intent — the
// Meta-compliant way to deliver a link after a comment/DM: send an opt-in
// button first, then fire `then` (e.g. send the link) only once the user taps.
// `title` ≤ 20 chars (Meta truncates). `then` is LeafAction[] (no nesting).
// `id` is a STABLE per-button identifier baked into the quick-reply payload so
// a tap routes to the right `then` regardless of the action's position (which
// shifts on resumed/post-wait runs or after an edit). Assigned at author/save
// time; runButtonTap resolves by id, never by index.
// Optional "opt-in gate" before a button delivers its `then` (e.g. the
// higgsfield-style "please follow to get the link → I followed!" step). When set,
// tapping the button first sends `text` + a single quick-reply (`button_title`);
// only when THAT is tapped does the button's `then` run. NOTE: this is a
// trust-based prompt — Instagram's API can't verify a follow, so "I followed!" is
// social pressure, not enforcement.
export type ButtonGate = { text: string; button_title: string };

export type ButtonOption = {
  id: string;
  title: string;
  gate?: ButtonGate;
  then: LeafAction[];
};

// Action variants. Discriminated union — the executor branches on `type`.
// Top-level actions add `wait` (timed delay) + `condition` (if/else) on top of
// the leaf actions. Branch arrays are LeafAction[] — TS enforces no nesting.
export type Action =
  | LeafAction
  | { type: "wait"; ms: number }
  // Pause until the contact's next inbound (or timeout_ms elapses → resume
  // with a "timed out" marker so the flow can take a no-reply path). The reply
  // text is exposed downstream as {{message_text}} + to message conditions.
  | { type: "wait_for_reply"; timeout_ms?: number }
  | {
      type: "condition";
      match: "all" | "any";
      conditions: AutomationCondition[];
      then: LeafAction[];
      else: LeafAction[];
    }
  // Instagram-only opt-in buttons. Sends `text` + up to ~3 quick-reply buttons;
  // each button's `then` runs when the user TAPS it (handled via the webhook),
  // not inline. This action is terminal for the inline chain.
  | {
      type: "send_buttons";
      text: string;
      buttons: ButtonOption[];
    }
  // AI intent split: an LLM reads the customer's message and routes the flow to
  // the matching intent's branch (or `else` when none fit). The "smart" sibling
  // of `condition` — branches on MEANING, not keywords. Each intent's `then` is
  // LeafAction[] (no nesting). `id` is stable (assigned at save time) so a
  // resumed/retried run replays the same branch without re-classifying. Costs AI
  // tokens (charged to the org); falls back to `else` when the budget is
  // exhausted, AI is unconfigured, or classification fails.
  | {
      type: "ai_branch";
      // Optional extra context handed to the classifier (e.g. "We sell shoes").
      instruction?: string;
      intents: AiIntent[];
      else: LeafAction[];
    };

// One branch of an `ai_branch`. `label` is what the classifier matches on (e.g.
// "Sales question"); `description` sharpens the match. `then` runs when chosen.
export type AiIntent = {
  id: string;
  label: string;
  description?: string;
  then: LeafAction[];
};

// Evaluate if/else conditions against the contact's tags + the trigger message.
// Pure — the caller supplies the already-fetched tags + message text.
export function evaluateConditions(
  conditions: AutomationCondition[],
  match: "all" | "any",
  ctx: {
    tags: string[];
    messageText: string;
    // Set after a wait_for_reply: whether a reply arrived vs the wait timed out.
    repliedByReply?: boolean;
    replyTimedOut?: boolean;
  },
): boolean {
  if (conditions.length === 0) return true; // no conditions → always "then"
  const tags = ctx.tags.map((t) => t.toLowerCase());
  const msg = ctx.messageText.toLowerCase();
  const results = conditions.map((c) => {
    if (c.field === "tag") {
      const has = tags.includes(c.value.trim().toLowerCase());
      return c.op === "has" ? has : !has;
    }
    if (c.field === "reply") {
      return c.op === "received" ? !!ctx.repliedByReply : !!ctx.replyTimedOut;
    }
    const value = (c.value ?? "").trim();
    const contains = value !== "" && msg.includes(value.toLowerCase());
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
