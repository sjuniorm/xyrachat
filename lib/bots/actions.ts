"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText, embedChunks } from "@/lib/ai/embeddings";
import { scrapeUrl } from "@/lib/ai/scraper";
import { assertCanAddBot, assertCanAddKnowledgeSource } from "@/lib/billing/gates";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// =====================================================================
// Auth + role helpers
// =====================================================================
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
  const orgId = profile?.org_id;
  if (!orgId) return { error: "You must belong to an organization." };
  if (!profile?.role || !roles.includes(profile.role)) {
    return { error: "You don't have permission for that." };
  }
  return { user: { id: user.id }, orgId, role: profile.role };
}

// =====================================================================
// CREATE — minimal config; the user edits the rest in the wizard / settings
// =====================================================================
export async function createBot(payload: {
  name: string;
  objective: string;
  objective_config?: Record<string, unknown>;
  instructions?: string | null;
  greeting_message?: string | null;
  tone?: string;
  personality?: Record<string, unknown>;
  language?: string;
  knowledge_threshold?: number;
  behavior_rules?: Record<string, unknown>;
  handoff_triggers?: string[];
  off_hours_message?: string | null;
  business_hours?: Record<string, unknown>;
  tools_config?: Record<string, { enabled?: boolean }>;
}): Promise<ActionResult<{ botId: string }>> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const name = payload.name.trim();
  if (!name) return { ok: false, error: "Bot name is required." };
  const validObjectives = [
    "support", "lead_generation", "website_traffic",
    "sales", "booking", "qualification", "custom",
  ];
  if (!validObjectives.includes(payload.objective)) {
    return { ok: false, error: "Invalid objective." };
  }

  // Plan gate — bot count cap. Fails open for un-provisioned orgs.
  const botGate = await assertCanAddBot(auth.orgId);
  if (!botGate.ok) return { ok: false, error: botGate.error };

  // Seed sensible tool defaults per objective so new bots can act out of the
  // box (e.g. lead_generation gets capture_lead + tag_contact + handoff).
  // Existing bots keep '{}' (no tools) — set in the DB default.
  const { defaultToolsConfig } = await import("@/lib/ai/tools");
  const toolsConfig = payload.tools_config ?? defaultToolsConfig(payload.objective);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bots")
    .insert({
      org_id: auth.orgId,
      name,
      objective: payload.objective,
      objective_config: payload.objective_config ?? {},
      instructions: payload.instructions ?? null,
      greeting_message: payload.greeting_message ?? null,
      tone: payload.tone ?? "friendly",
      personality: payload.personality ?? {},
      language: payload.language ?? "en",
      knowledge_threshold: payload.knowledge_threshold ?? 0.7,
      behavior_rules: payload.behavior_rules ?? {},
      handoff_triggers: payload.handoff_triggers ?? null,
      off_hours_message: payload.off_hours_message ?? null,
      business_hours: payload.business_hours ?? { active: false },
      tools_config: toolsConfig,
      active: true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/bots");
  return { ok: true, data: { botId: data.id } };
}

// =====================================================================
// UPDATE
// =====================================================================
export async function updateBot(
  botId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("org_id")
    .eq("id", botId)
    .maybeSingle();
  if (!bot || bot.org_id !== auth.orgId) {
    return { ok: false, error: "Bot not found in your org." };
  }

  // Whitelist updatable columns to avoid clients writing org_id / id / etc.
  const allowed = new Set([
    "name", "instructions", "objective", "objective_config",
    "tone", "personality", "greeting_message", "off_hours_message",
    "business_hours", "knowledge_threshold", "language", "behavior_rules",
    "handoff_triggers", "tools_config", "active",
  ]);
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (allowed.has(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  const { error } = await admin.from("bots").update(filtered).eq("id", botId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/bots");
  revalidatePath(`/bots/${botId}`);
  return { ok: true };
}

// =====================================================================
// SOFT-DELETE
// =====================================================================
export async function deleteBot(botId: string): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("org_id")
    .eq("id", botId)
    .maybeSingle();
  if (!bot || bot.org_id !== auth.orgId) {
    return { ok: false, error: "Bot not found in your org." };
  }
  const { error } = await admin
    .from("bots")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", botId);
  if (error) return { ok: false, error: error.message };

  // Also disable any active channel assignments so a deleted bot
  // doesn't keep getting webhooks.
  await admin.from("bot_assignments").update({ active: false }).eq("bot_id", botId);

  revalidatePath("/bots");
  redirect("/bots");
}

// =====================================================================
// ASSIGN / UNASSIGN bot from a channel
// =====================================================================
export async function setChannelAssignment(
  botId: string,
  channelId: string,
  enable: boolean,
): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  // Verify both bot and channel belong to the org.
  const [{ data: bot }, { data: channel }] = await Promise.all([
    admin.from("bots").select("org_id").eq("id", botId).maybeSingle(),
    admin.from("channels").select("org_id").eq("id", channelId).maybeSingle(),
  ]);
  if (!bot || bot.org_id !== auth.orgId) {
    return { ok: false, error: "Bot not in your org." };
  }
  if (!channel || channel.org_id !== auth.orgId) {
    return { ok: false, error: "Channel not in your org." };
  }

  if (!enable) {
    await admin
      .from("bot_assignments")
      .delete()
      .eq("bot_id", botId)
      .eq("channel_id", channelId);
    revalidatePath(`/bots/${botId}`);
    return { ok: true };
  }

  // Multiple bots may now share a channel (the gate routes between them), so we
  // no longer clobber other bots here. Upsert this (bot, channel) pair —
  // UNIQUE(channel_id, bot_id) keeps it idempotent.
  const { error } = await admin
    .from("bot_assignments")
    .upsert(
      { bot_id: botId, channel_id: channelId, active: true },
      { onConflict: "channel_id,bot_id" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/bots/${botId}`);
  return { ok: true };
}

// =====================================================================
// Routing description — the hint the multi-bot classifier uses to pick this
// bot on a shared channel (e.g. "pricing + sales questions"). Per (bot, channel).
// =====================================================================
export async function setAssignmentRouting(
  botId: string,
  channelId: string,
  routingDescription: string,
): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("org_id")
    .eq("id", botId)
    .maybeSingle();
  if (!bot || bot.org_id !== auth.orgId) {
    return { ok: false, error: "Bot not in your org." };
  }
  const { error } = await admin
    .from("bot_assignments")
    .update({ routing_description: routingDescription.trim().slice(0, 280) || null })
    .eq("bot_id", botId)
    .eq("channel_id", channelId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/bots/${botId}`);
  return { ok: true };
}

// =====================================================================
// SOURCES — add text / URL (file upload deferred)
// =====================================================================
export async function addTextSource(
  botId: string,
  title: string,
  content: string,
): Promise<ActionResult<{ sourceId: string }>> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!title.trim()) return { ok: false, error: "Title is required." };
  if (content.trim().length < 20) {
    return { ok: false, error: "Content too short (min 20 chars)." };
  }

  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("org_id")
    .eq("id", botId)
    .maybeSingle();
  if (!bot || bot.org_id !== auth.orgId) {
    return { ok: false, error: "Bot not in your org." };
  }

  // Plan gate — per-bot knowledge-source cap. Fails open un-provisioned.
  const srcGate = await assertCanAddKnowledgeSource(auth.orgId, botId);
  if (!srcGate.ok) return { ok: false, error: srcGate.error };

  const { data: source, error } = await admin
    .from("bot_sources")
    .insert({
      bot_id: botId,
      type: "text",
      title: title.trim(),
      content,
      embedding_status: "pending",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Kick off the embedding pipeline. Wrapped in try/catch so a failure
  // doesn't leak — embedChunks updates embedding_status on its own.
  try {
    await embedChunks(chunkText(content), source.id);
  } catch (err) {
    // Status already marked failed; surface the message for the toast.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Embedding failed.",
    };
  }
  revalidatePath(`/bots/${botId}`);
  return { ok: true, data: { sourceId: source.id } };
}

export async function addUrlSource(
  botId: string,
  url: string,
): Promise<ActionResult<{ sourceId: string }>> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }

  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("org_id")
    .eq("id", botId)
    .maybeSingle();
  if (!bot || bot.org_id !== auth.orgId) {
    return { ok: false, error: "Bot not in your org." };
  }

  // Plan gate — per-bot knowledge-source cap. Fails open un-provisioned.
  const srcGate = await assertCanAddKnowledgeSource(auth.orgId, botId);
  if (!srcGate.ok) return { ok: false, error: srcGate.error };

  // Create the source row first so the UI can show progress.
  const { data: source, error: insertErr } = await admin
    .from("bot_sources")
    .insert({
      bot_id: botId,
      type: "url",
      title: parsed.hostname + parsed.pathname,
      url: parsed.toString(),
      embedding_status: "running",
    })
    .select("id")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  try {
    const scraped = await scrapeUrl(parsed.toString());
    await admin
      .from("bot_sources")
      .update({ title: scraped.title, content: scraped.text })
      .eq("id", source.id);
    await embedChunks(chunkText(scraped.text), source.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from("bot_sources")
      .update({ embedding_status: "failed", embedding_error: msg })
      .eq("id", source.id);
    return { ok: false, error: msg };
  }

  revalidatePath(`/bots/${botId}`);
  return { ok: true, data: { sourceId: source.id } };
}

export async function deleteSource(
  sourceId: string,
): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  // Verify ownership through bot.org_id.
  const { data: source } = await admin
    .from("bot_sources")
    .select("id, bot_id, bots:bots!bot_sources_bot_id_fkey(org_id)")
    .eq("id", sourceId)
    .maybeSingle();
  const orgId = (source?.bots as { org_id?: string } | null)?.org_id;
  if (!source || orgId !== auth.orgId) {
    return { ok: false, error: "Source not in your org." };
  }
  // Hard delete the embeddings + source row. They're cheap to regenerate
  // and we'd rather not carry deleted_at gymnastics in the RAG query path.
  const { error } = await admin
    .from("bot_sources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", sourceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/bots/${source.bot_id}`);
  return { ok: true };
}

// =====================================================================
// TEST — ephemeral run via generateBotResponse, never written to DB
// =====================================================================
export async function testBot(
  botId: string,
  history: Array<{ direction: "inbound" | "outbound"; content: string }>,
  newMessage: string,
): Promise<
  ActionResult<{
    response: string;
    shouldHandoff: boolean;
    sourcesUsed: string[];
    maxSimilarity: number;
    knowledgeThreshold: number;
    toolsInvoked: string[];
  }>
> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("*")
    .eq("id", botId)
    .maybeSingle();
  if (!bot || bot.org_id !== auth.orgId) {
    return { ok: false, error: "Bot not in your org." };
  }
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", auth.orgId)
    .maybeSingle();

  const { generateBotResponse } = await import("@/lib/ai/chatbot");
  const { selectEnabledTools } = await import("@/lib/ai/tools");
  const { checkAiQuota, consumeAiTokens } = await import("@/lib/billing/usage");
  const quota = await checkAiQuota(auth.orgId);
  if (!quota.ok) {
    return {
      ok: false,
      error:
        "Your workspace has used all of its AI tokens for this month. Upgrade your plan to keep testing.",
    };
  }
  try {
    // Test mode: offer the bot's enabled tools so testers can verify the model
    // CALLS them, but the executor is a NO-OP — it never mutates live
    // contacts/conversations. request_human_handoff still signals handoff so
    // the test reflects it.
    const tools = selectEnabledTools(
      (bot as { tools_config?: unknown }).tools_config,
    );
    const result = await generateBotResponse({
      bot: bot as Parameters<typeof generateBotResponse>[0]["bot"],
      orgName: org?.name ?? "us",
      recentMessages: history.map((h) => ({
        direction: h.direction,
        content: h.content,
        sender_type: h.direction === "inbound" ? "contact" : "bot",
      })),
      newMessage,
      tools,
      executeTool:
        tools.length > 0
          ? async (name) =>
              name === "request_human_handoff"
                ? { content: "(test mode) would hand off to a human", handoff: { reason: "test" } }
                : { content: "(test mode — tool not executed)" }
          : undefined,
    });
    await consumeAiTokens(
      auth.orgId,
      result.usage.input_tokens + result.usage.output_tokens + result.embeddingTokens,
    );
    return {
      ok: true,
      data: {
        response: result.response,
        shouldHandoff: result.shouldHandoff,
        sourcesUsed: result.sourcesUsed,
        maxSimilarity: result.maxSimilarity,
        knowledgeThreshold: bot.knowledge_threshold,
        toolsInvoked: result.toolsInvoked,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Test failed.",
    };
  }
}
