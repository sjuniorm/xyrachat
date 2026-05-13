"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConversationStatus } from "@/lib/db-types";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUserOrg(): Promise<
  { ok: true; orgId: string; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "Not in an org." };
  return { ok: true, orgId: me.org_id, userId: user.id };
}

async function authorizeConversation(
  conversationId: string,
  orgId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .select("org_id")
    .eq("id", conversationId)
    .maybeSingle();
  return data?.org_id === orgId;
}

/**
 * Assign a conversation to an agent (or null = unassign).
 */
export async function assignConversation(
  formData: FormData,
): Promise<ActionResult> {
  const conversationId = String(formData.get("conversation_id") ?? "");
  const rawAgent = String(formData.get("agent_id") ?? "");
  const agentId = rawAgent && rawAgent !== "null" ? rawAgent : null;

  const auth = await requireUserOrg();
  if (!auth.ok) return auth;
  if (!conversationId) return { ok: false, error: "Missing conversation id." };
  if (!(await authorizeConversation(conversationId, auth.orgId))) {
    return { ok: false, error: "Not your org's conversation." };
  }

  if (agentId) {
    const admin = createAdminClient();
    const { data: peer } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", agentId)
      .maybeSingle();
    if (peer?.org_id !== auth.orgId) {
      return { ok: false, error: "Agent is not in your org." };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ assigned_to: agentId })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}

/**
 * Bulk assign — used by the conversation-list checkboxes.
 */
export async function assignConversationsBulk(
  formData: FormData,
): Promise<ActionResult> {
  const idsRaw = String(formData.get("conversation_ids") ?? "");
  const rawAgent = String(formData.get("agent_id") ?? "");
  const agentId = rawAgent && rawAgent !== "null" ? rawAgent : null;
  const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No conversations selected." };

  const auth = await requireUserOrg();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  if (agentId) {
    const { data: peer } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", agentId)
      .maybeSingle();
    if (peer?.org_id !== auth.orgId) {
      return { ok: false, error: "Agent is not in your org." };
    }
  }

  const { error } = await admin
    .from("conversations")
    .update({ assigned_to: agentId })
    .in("id", ids)
    .eq("org_id", auth.orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}

/**
 * Change a conversation's status. Accepts open / closed / bot. For snoozed,
 * use snoozeConversation so the caller can pass snooze_until.
 */
export async function setConversationStatus(
  formData: FormData,
): Promise<ActionResult> {
  const conversationId = String(formData.get("conversation_id") ?? "");
  const status = String(formData.get("status") ?? "") as ConversationStatus;

  if (!["open", "closed", "bot"].includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  const auth = await requireUserOrg();
  if (!auth.ok) return auth;
  if (!(await authorizeConversation(conversationId, auth.orgId))) {
    return { ok: false, error: "Not your org's conversation." };
  }

  const admin = createAdminClient();
  // Closing a conversation auto-unassigns the agent — matches user
  // expectation that "I'm done with this" should free me from it. Reopening
  // (open) does NOT re-assign anyone — agents pick it back up explicitly.
  const update: Record<string, unknown> = { status, snooze_until: null };
  if (status === "closed") update.assigned_to = null;

  const { error } = await admin
    .from("conversations")
    .update(update)
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}

/**
 * Snooze a conversation for a duration. Picker passes a preset key
 * (1h / 4h / tomorrow / next_week) and we compute the wake-up time server-side.
 */
export async function snoozeConversation(
  formData: FormData,
): Promise<ActionResult> {
  const conversationId = String(formData.get("conversation_id") ?? "");
  const preset = String(formData.get("preset") ?? "");

  let snoozeUntil: Date;
  const now = new Date();
  switch (preset) {
    case "1h":
      snoozeUntil = new Date(now.getTime() + 60 * 60 * 1000);
      break;
    case "4h":
      snoozeUntil = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      break;
    case "tomorrow": {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      t.setHours(9, 0, 0, 0);
      snoozeUntil = t;
      break;
    }
    case "next_week": {
      const t = new Date(now);
      t.setDate(t.getDate() + 7);
      t.setHours(9, 0, 0, 0);
      snoozeUntil = t;
      break;
    }
    default:
      return { ok: false, error: "Unknown snooze preset." };
  }

  const auth = await requireUserOrg();
  if (!auth.ok) return auth;
  if (!(await authorizeConversation(conversationId, auth.orgId))) {
    return { ok: false, error: "Not your org's conversation." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ status: "snoozed", snooze_until: snoozeUntil.toISOString() })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}

/**
 * Bulk status change.
 */
export async function setConversationsStatusBulk(
  formData: FormData,
): Promise<ActionResult> {
  const idsRaw = String(formData.get("conversation_ids") ?? "");
  const status = String(formData.get("status") ?? "") as ConversationStatus;
  if (!["open", "closed", "bot"].includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No conversations selected." };

  const auth = await requireUserOrg();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  // Bulk close also unassigns — same rule as the single-conversation path.
  const update: Record<string, unknown> = { status, snooze_until: null };
  if (status === "closed") update.assigned_to = null;

  const { error } = await admin
    .from("conversations")
    .update(update)
    .in("id", ids)
    .eq("org_id", auth.orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}

/**
 * Bulk soft-delete. Sets deleted_at on conversations — they disappear from
 * the inbox immediately but rows stay for audit / undo (future).
 */
export async function deleteConversationsBulk(
  formData: FormData,
): Promise<ActionResult> {
  const idsRaw = String(formData.get("conversation_ids") ?? "");
  const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No conversations selected." };

  const auth = await requireUserOrg();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids)
    .eq("org_id", auth.orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}
