"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveServingBot } from "@/lib/inbox/server";
import { buildConversationSummary } from "@/lib/ai/summarize";
import { maybeSendSurvey } from "@/lib/surveys/server";
import { checkAiQuota, consumeAiTokens } from "@/lib/billing/usage";
import { getAgentPermissions, agentBlocked } from "@/lib/team/permissions";
import type { ConversationStatus } from "@/lib/db-types";

type ActionResult = { ok: true } | { ok: false; error: string };
type SummaryResult =
  | { ok: true; summary: string; tags: string[] }
  | { ok: false; error: string };

async function requireUserOrg(): Promise<
  { ok: true; orgId: string; userId: string; role: string | null } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "Not in an org." };
  return { ok: true, orgId: me.org_id, userId: user.id, role: me.role ?? null };
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

// AI summary + suggested tags for a conversation (on-demand). Stores the result
// on conversations.metadata so it persists + can be re-shown without re-spending.
export async function generateConversationSummary(
  conversationId: string,
): Promise<SummaryResult> {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth;
  if (!(await authorizeConversation(conversationId, auth.orgId))) {
    return { ok: false, error: "Conversation not found." };
  }

  const quota = await checkAiQuota(auth.orgId);
  if (!quota.ok) return { ok: false, error: "Monthly AI limit reached. Upgrade to keep using AI." };

  const admin = createAdminClient();
  const { data: messages } = await admin
    .from("messages")
    .select("direction, content, sender_type")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (!messages || messages.length === 0) {
    return { ok: false, error: "Nothing to summarize yet." };
  }

  let result;
  try {
    result = await buildConversationSummary(messages);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Summary failed." };
  }
  if (!result) return { ok: false, error: "AI isn't configured." };

  await consumeAiTokens(auth.orgId, result.inputTokens + result.outputTokens);

  // Merge into existing metadata so we don't clobber other keys.
  const { data: conv } = await admin
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();
  const metadata = {
    ...((conv?.metadata as Record<string, unknown>) ?? {}),
    summary: result.summary,
    summary_at: new Date().toISOString(),
    suggested_tags: result.tags,
  };
  await admin.from("conversations").update({ metadata }).eq("id", conversationId);

  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true, summary: result.summary, tags: result.tags };
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

  // On close, fire a CSAT/NPS survey if the org enabled it (no-op otherwise).
  if (status === "closed") void maybeSendSurvey(conversationId);

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

  // Survey each newly-closed conversation (no-op unless the org enabled it).
  if (status === "closed") {
    for (const id of ids) void maybeSendSurvey(id);
  }

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

  // Agent-permission gate: the org can forbid agents from deleting conversations.
  const perms = await getAgentPermissions(auth.orgId);
  if (agentBlocked(auth.role, perms, "can_delete_conversations")) {
    return { ok: false, error: "Your role can't delete conversations." };
  }

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

/**
 * Toggle bot-only mode on a conversation. When on, the inbox hides the human
 * composer and the bot gate bypasses auto-pause + the assigned check, so the
 * conversation runs as a fully-automated funnel.
 */
export async function setConversationBotOnly(
  conversationId: string,
  value: boolean,
): Promise<ActionResult> {
  if (!conversationId) return { ok: false, error: "Missing conversation id." };
  const auth = await requireUserOrg();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("org_id, channel_id, bot_id_override, routed_bot_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (conv?.org_id !== auth.orgId) {
    return { ok: false, error: "Not your org's conversation." };
  }

  // Enabling bot-only on a conversation no bot can serve creates a silent
  // dead funnel (composer hidden, gate exits 'no_bot_assigned', customer gets
  // no reply). Refuse unless a bot will actually answer: either an override is
  // pinned to a live bot, or a live bot is assigned to this channel.
  if (value) {
    const serving = await resolveServingBot(
      conv.channel_id,
      conv.bot_id_override,
      conv.routed_bot_id,
      auth.orgId,
    );
    if (!serving.serves) {
      return {
        ok: false,
        error: "Assign a bot to this channel (or pin one with “Use bot”) before turning on bot-only mode.",
      };
    }
  }

  const { error } = await admin
    .from("conversations")
    .update({ bot_only: value })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}

/**
 * Pin a specific bot to a conversation (or null = auto / route by channel).
 * The bot gate honors this over the channel's intent routing. The bot must
 * belong to the caller's org — verified server-side so a tampered client
 * can't pin another org's bot into this conversation.
 */
export async function setConversationBotOverride(
  conversationId: string,
  botId: string | null,
): Promise<ActionResult> {
  if (!conversationId) return { ok: false, error: "Missing conversation id." };
  const auth = await requireUserOrg();
  if (!auth.ok) return auth;
  if (!(await authorizeConversation(conversationId, auth.orgId))) {
    return { ok: false, error: "Not your org's conversation." };
  }

  const admin = createAdminClient();
  if (botId) {
    const { data: bot } = await admin
      .from("bots")
      .select("id")
      .eq("id", botId)
      .eq("org_id", auth.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!bot) return { ok: false, error: "Bot not found in your org." };
  }

  const { error } = await admin
    .from("conversations")
    .update({ bot_id_override: botId })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}

/**
 * Mark a conversation read for the current agent (upsert last_read_at = now).
 * Fire-and-forget from the thread on open / new message. RLS scopes the row to
 * the caller (user_id = auth.uid()).
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  if (!conversationId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("conversation_reads").upsert(
    {
      conversation_id: conversationId,
      user_id: user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
}

/**
 * Mark a conversation unread for the current agent — set last_read_at to the
 * epoch so the unread check (last_inbound_at > last_read_at) flags it again.
 */
export async function markConversationUnread(
  conversationId: string,
): Promise<ActionResult> {
  if (!conversationId) return { ok: false, error: "Missing conversation id." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("conversation_reads").upsert(
    {
      conversation_id: conversationId,
      user_id: user.id,
      last_read_at: new Date(0).toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}
