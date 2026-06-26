"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Action, AiIntent, TriggerConfig, TriggerType } from "./types";
import { allowedTriggersForChannel } from "./types";
import { runIntentClassifier } from "./executor";
import { assertCanUseAutomations } from "@/lib/billing/gates";
import { checkAiQuota } from "@/lib/billing/usage";
import { isAnthropicConfigured } from "@/lib/ai/clients";
import { sanitizeBusinessHours } from "@/lib/bots/business-hours";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

type AuthSuccess = {
  user: { id: string };
  orgId: string;
  role: "owner" | "admin" | "supervisor" | "agent";
};
type AuthFailure = { error: string };

async function requireOrgRole(
  roles: Array<"owner" | "admin" | "supervisor" | "agent">,
): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return { error: "You must belong to an organization." };
  if (!profile?.role || !roles.includes(profile.role)) {
    return { error: "You don't have permission for that." };
  }
  return { user: { id: user.id }, orgId: profile.org_id, role: profile.role };
}

export async function createAutomation(payload: {
  name: string;
  description?: string;
  channelId: string;
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  actions: Action[];
}): Promise<ActionResult<{ automationId: string }>> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const name = payload.name.trim();
  if (!name) return { ok: false, error: "Automation name is required." };

  // Plan gate: feature flag + rule-count cap (Solo/Core are "limited").
  const gate = await assertCanUseAutomations(auth.orgId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createAdminClient();
  const { data: ch } = await admin
    .from("channels")
    .select("id, org_id, type")
    .eq("id", payload.channelId)
    .maybeSingle();
  if (!ch || ch.org_id !== auth.orgId) {
    return { ok: false, error: "Channel not in your org." };
  }

  // Cross-check trigger_type against channel type so the UI can't
  // create an IG trigger on a WhatsApp channel etc.
  const allowed = allowedTriggersForChannel(ch.type);
  if (!allowed.includes(payload.triggerType)) {
    return {
      ok: false,
      error: `Trigger '${payload.triggerType}' isn't valid on ${ch.type} channels.`,
    };
  }

  // Sanity-check actions.
  if (!Array.isArray(payload.actions) || payload.actions.length === 0) {
    return { ok: false, error: "Add at least one action step." };
  }
  for (const a of payload.actions) {
    const err = validateAction(a, ch.type);
    if (err) return { ok: false, error: err };
  }
  const normalizedActions = normalizeActions(payload.actions);

  // For an external-webhook trigger, mint a per-automation secret so the
  // /api/automations/:id/trigger endpoint has something to authenticate
  // against. Without it the trigger would be unfireable (the bug this fixes).
  const triggerConfig: TriggerConfig = { ...(payload.triggerConfig ?? {}) };
  if (payload.triggerType === "webhook" && !triggerConfig.webhook_secret) {
    const { randomBytes } = await import("crypto");
    triggerConfig.webhook_secret = `xyra_at_${randomBytes(24).toString("hex")}`;
  }
  // Active-hours: coerce to a safe shape (valid tz, capped/validated windows)
  // before persisting — the gate reads this on the hot path.
  if (triggerConfig.business_hours) {
    triggerConfig.business_hours = sanitizeBusinessHours(triggerConfig.business_hours);
  }

  const { data, error } = await admin
    .from("automations")
    .insert({
      org_id: auth.orgId,
      channel_id: payload.channelId,
      name,
      description: payload.description ?? null,
      trigger_type: payload.triggerType,
      trigger_config: triggerConfig,
      actions: normalizedActions,
      active: true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/automations");
  return { ok: true, data: { automationId: data.id } };
}

export async function updateAutomation(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    trigger_type: TriggerType;
    trigger_config: TriggerConfig;
    actions: Action[];
    active: boolean;
  }>,
): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("automations")
    .select("org_id, channel_id")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.org_id !== auth.orgId) {
    return { ok: false, error: "Automation not in your org." };
  }

  if (patch.actions) {
    // Resolve the channel type so send_buttons (IG-only) is validated at save.
    let channelType: string | undefined;
    if (row.channel_id) {
      const { data: ch } = await admin
        .from("channels")
        .select("type")
        .eq("id", row.channel_id)
        .maybeSingle();
      channelType = ch?.type;
    }
    for (const a of patch.actions) {
      const err = validateAction(a, channelType);
      if (err) return { ok: false, error: err };
    }
    patch.actions = normalizeActions(patch.actions);
  }

  // Sanitize the active-hours schedule (if the trigger_config is being updated).
  if (patch.trigger_config?.business_hours) {
    patch.trigger_config = {
      ...patch.trigger_config,
      business_hours: sanitizeBusinessHours(patch.trigger_config.business_hours),
    };
  }

  // Whitelist updatable columns.
  const allowed = new Set([
    "name", "description", "trigger_type", "trigger_config",
    "actions", "active",
  ]);
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (allowed.has(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }
  const { error } = await admin.from("automations").update(filtered).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/automations");
  revalidatePath(`/automations/${id}`);
  return { ok: true };
}

export async function deleteAutomation(id: string): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("automations")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.org_id !== auth.orgId) {
    return { ok: false, error: "Automation not in your org." };
  }
  const { error } = await admin
    .from("automations")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/automations");
  redirect("/automations");
}

export async function setAutomationActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  return updateAutomation(id, { active });
}

// Builder preview for an "AI intent split" node: classify a sample message
// against the CURRENT (possibly unsaved) intents and report which branch it
// would take, so the operator can tune intent labels/descriptions before going
// live. Auth-gated to automation editors; runs against (and charges) the
// caller's OWN org budget — no contact data, no writes. Mirrors the bot Test tab.
export async function testAiBranch(payload: {
  instruction?: string;
  intents: Array<{ id?: string; label: string; description?: string }>;
  message: string;
}): Promise<ActionResult<{ matchedId: string | null; matchedLabel: string | null }>> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const message = (payload.message ?? "").trim();
  if (!message) return { ok: false, error: "Type a sample message to test." };
  if (message.length > 2000) return { ok: false, error: "That test message is too long." };

  const intents: AiIntent[] = (payload.intents ?? [])
    .filter((i) => i.label?.trim())
    .slice(0, MAX_AI_INTENTS)
    .map((i) => ({
      id: i.id || crypto.randomUUID(),
      label: i.label.trim(),
      description: i.description?.trim() || undefined,
      then: [],
    }));
  if (intents.length === 0) {
    return { ok: false, error: "Add at least one intent with a label first." };
  }

  // Clear, distinct messages so a "no match" result isn't confused with AI
  // being off or the budget being spent.
  if (!isAnthropicConfigured()) {
    return { ok: false, error: "AI isn't configured on the server yet." };
  }
  const quota = await checkAiQuota(auth.orgId);
  if (!quota.ok) {
    return {
      ok: false,
      error: "Your monthly AI usage limit is reached — upgrade or wait for the reset to test.",
    };
  }

  const chosen = await runIntentClassifier(auth.orgId, message, {
    instruction: payload.instruction,
    intents,
  });
  const matched = intents.find((it) => it.id === chosen) ?? null;
  return { ok: true, data: { matchedId: matched?.id ?? null, matchedLabel: matched?.label ?? null } };
}

// =====================================================================
// Helpers
// =====================================================================
// Leaf action types permitted inside an if/else branch (no nested
// wait/condition). Branches are typed LeafAction[], but a hand-crafted API
// payload could try to smuggle a non-leaf in — reject it at the boundary.
const LEAF_TYPES = new Set([
  "send_dm",
  "reply_comment",
  "tag_contact",
  "assign_agent",
  "assign_smart",
  "webhook",
  "add_to_sequence",
]);

// Assigns a stable id to any send_buttons button missing one (the live
// quick-reply payload routes taps by id). UI-created buttons already carry one;
// this covers API/SQL-authored automations so a tap can never misroute.
function normalizeActions(actions: Action[]): Action[] {
  return actions.map((a) => {
    if (a.type === "send_buttons") {
      return {
        ...a,
        buttons: (a.buttons ?? []).map((b) =>
          b.id ? b : { ...b, id: crypto.randomUUID() },
        ),
      };
    }
    if (a.type === "ai_branch") {
      // Each intent needs a stable id — the executor keys its sticky branch
      // decision + per-leaf idempotency stamps on it (so a resumed/retried run
      // replays the same branch and never re-classifies / double-sends).
      return {
        ...a,
        intents: (a.intents ?? []).map((it) =>
          it.id ? it : { ...it, id: crypto.randomUUID() },
        ),
      };
    }
    return a;
  });
}

// Cap the number of intents so the classifier prompt + flow stay bounded.
const MAX_AI_INTENTS = 8;

function validateAction(action: Action, channelType?: string): string | null {
  switch (action.type) {
    case "send_dm":
      if (!action.text?.trim()) return "Each Send DM step needs a message.";
      return null;
    case "reply_comment":
      if (channelType && channelType !== "instagram") {
        return "Public comment replies are only available on Instagram channels.";
      }
      if (!action.text?.trim()) return "Each Reply-to-comment step needs a message.";
      return null;
    case "tag_contact":
      if (!action.tag?.trim()) return "Each Tag step needs a tag value.";
      return null;
    case "assign_agent":
      // agent_id null is valid (clears assignment).
      return null;
    case "assign_smart":
      if (action.strategy !== "round_robin" && action.strategy !== "least_busy") {
        return "Smart assignment needs a valid strategy.";
      }
      return null;
    case "webhook":
      try {
        new URL(action.url);
      } catch {
        return "Webhook URL is invalid.";
      }
      return null;
    case "add_to_sequence":
      if (!action.sequence_id?.trim()) return "Pick a sequence for the Add to sequence step.";
      return null;
    case "wait":
      if (!Number.isFinite(action.ms) || action.ms < 0) {
        return "Wait step needs a positive duration.";
      }
      return null;
    case "wait_for_reply":
      if (
        action.timeout_ms !== undefined &&
        (!Number.isFinite(action.timeout_ms) || action.timeout_ms <= 0)
      ) {
        return "Wait-for-reply timeout must be a positive duration.";
      }
      return null;
    case "condition": {
      if (!Array.isArray(action.conditions) || action.conditions.length === 0) {
        return "Each If/else step needs at least one condition.";
      }
      for (const c of action.conditions) {
        // Reply conditions (received / timed_out) carry no value.
        if (c.field !== "reply" && !c.value?.trim()) {
          return "Each If/else condition needs a value.";
        }
      }
      // Branch actions must be leaves (no nested wait/condition) — enforce
      // structurally, then validate each with the same per-leaf rules.
      for (const leaf of [...action.then, ...action.else]) {
        if (!LEAF_TYPES.has(leaf.type)) {
          return "If/else branches can only contain simple actions (no nested waits or conditions).";
        }
        const err = validateAction(leaf);
        if (err) return err;
      }
      return null;
    }
    case "send_buttons": {
      // Quick-reply opt-in buttons are an Instagram-only messaging feature —
      // reject at save time so it doesn't fail silently at runtime.
      if (channelType && channelType !== "instagram") {
        return "Button steps are only available on Instagram channels.";
      }
      if (!action.text?.trim()) return "The button message needs some text.";
      if (!Array.isArray(action.buttons) || action.buttons.length === 0) {
        return "Add at least one button.";
      }
      if (action.buttons.length > 3) {
        return "A button step can have at most 3 buttons.";
      }
      for (const b of action.buttons) {
        if (!b.title?.trim()) return "Each button needs a label.";
        if (b.title.trim().length > 20) return "Button labels must be 20 characters or fewer.";
        if (!Array.isArray(b.then) || b.then.length === 0) {
          return "Each button needs at least one action to run when tapped.";
        }
        for (const leaf of b.then) {
          if (!LEAF_TYPES.has(leaf.type)) {
            return "Button actions can only be simple actions (no nested waits or conditions).";
          }
          const err = validateAction(leaf);
          if (err) return err;
        }
        // Optional follow/opt-in gate: an extra confirm step shown before the
        // button delivers its `then` (e.g. "Follow us first → I followed!").
        if (b.gate !== undefined) {
          if (!b.gate.text?.trim()) return "The follow/opt-in step needs a message.";
          if (!b.gate.button_title?.trim()) return "The follow/opt-in step needs a button label.";
          if (b.gate.button_title.trim().length > 20) {
            return "Follow/opt-in button labels must be 20 characters or fewer.";
          }
        }
      }
      return null;
    }
    case "ai_branch": {
      if (!Array.isArray(action.intents) || action.intents.length === 0) {
        return "An AI intent split needs at least one intent.";
      }
      if (action.intents.length > MAX_AI_INTENTS) {
        return `An AI intent split can have at most ${MAX_AI_INTENTS} intents.`;
      }
      for (const it of action.intents) {
        if (!it.label?.trim()) return "Each intent needs a label.";
        if (it.label.trim().length > 80) return "Intent labels must be 80 characters or fewer.";
        // Branch leaves must be simple actions (no nested waits/conditions),
        // same rule as if/else branches.
        if (!Array.isArray(it.then)) return "Each intent needs an action list.";
        for (const leaf of it.then) {
          if (!LEAF_TYPES.has(leaf.type)) {
            return "AI intent branches can only contain simple actions (no nested waits or conditions).";
          }
          const err = validateAction(leaf);
          if (err) return err;
        }
      }
      // The else branch is optional but, when present, follows the same rule.
      for (const leaf of action.else ?? []) {
        if (!LEAF_TYPES.has(leaf.type)) {
          return "AI intent branches can only contain simple actions (no nested waits or conditions).";
        }
        const err = validateAction(leaf);
        if (err) return err;
      }
      return null;
    }
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return "Unknown action type.";
    }
  }
}
