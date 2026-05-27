"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Action, TriggerConfig, TriggerType } from "./types";
import { allowedTriggersForChannel } from "./types";

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
    const err = validateAction(a);
    if (err) return { ok: false, error: err };
  }

  const { data, error } = await admin
    .from("automations")
    .insert({
      org_id: auth.orgId,
      channel_id: payload.channelId,
      name,
      description: payload.description ?? null,
      trigger_type: payload.triggerType,
      trigger_config: payload.triggerConfig ?? {},
      actions: payload.actions,
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
    for (const a of patch.actions) {
      const err = validateAction(a);
      if (err) return { ok: false, error: err };
    }
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

// =====================================================================
// Helpers
// =====================================================================
function validateAction(action: Action): string | null {
  switch (action.type) {
    case "send_dm":
      if (!action.text?.trim()) return "Each Send DM step needs a message.";
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
      return null;
    case "wait":
      if (!Number.isFinite(action.ms) || action.ms < 0) {
        return "Wait step needs a positive duration.";
      }
      return null;
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return "Unknown action type.";
    }
  }
}
