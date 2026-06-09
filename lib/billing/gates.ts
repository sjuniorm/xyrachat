import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getLimit,
  hasFeature,
  isProvisioned,
  type FeatureKey,
} from "./entitlements";

// =====================================================================
// Resource gates — the functions every create/invite path calls before
// inserting. Each returns a friendly { ok, error } so callers surface a
// clear upgrade message instead of a generic failure.
//
// All gates inherit the fail-open backstop from entitlements.ts: an
// un-provisioned org passes everything. Once the operator backfills,
// the org's bundle limits apply.
//
// These count CURRENT usage live (not a cached usage_metrics row) so
// the gate is always accurate even right after a delete.
// =====================================================================

export type GateResult = { ok: true } | { ok: false; error: string };

// Channels — both a count cap (channels:max) and per-type availability
// (channels:whatsapp etc). Counts non-deleted channels in the org.
export async function assertCanAddChannel(
  orgId: string,
  channelType: "whatsapp" | "instagram" | "telegram" | "email" | "facebook" | "webchat",
): Promise<GateResult> {
  // Per-type availability flag. facebook reuses the instagram flag (same Meta
  // app surface). webchat is a free first-party channel — always available, only
  // bounded by the overall channel count limit below.
  const typeKey: FeatureKey | null =
    channelType === "webchat"
      ? null
      : channelType === "facebook"
        ? "channels:instagram"
        : (`channels:${channelType}` as FeatureKey);
  if (typeKey && !(await hasFeature(orgId, typeKey))) {
    return {
      ok: false,
      error: `Your plan doesn't include ${channelType} channels. Upgrade to connect one.`,
    };
  }

  const max = await getLimit(orgId, "channels:max");
  if (max === Infinity) return { ok: true };
  const admin = createAdminClient();
  const { count } = await admin
    .from("channels")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if ((count ?? 0) >= max) {
    return {
      ok: false,
      error: `You've reached your channel limit (${max}). Upgrade your plan to connect more.`,
    };
  }
  return { ok: true };
}

// Bots — count cap (bots:max). Counts non-deleted bots.
export async function assertCanAddBot(orgId: string): Promise<GateResult> {
  const max = await getLimit(orgId, "bots:max");
  if (max === Infinity) return { ok: true };
  const admin = createAdminClient();
  const { count } = await admin
    .from("bots")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if ((count ?? 0) >= max) {
    return {
      ok: false,
      error: `You've reached your bot limit (${max}). Upgrade your plan to create more.`,
    };
  }
  return { ok: true };
}

// Knowledge sources per bot — count cap (bots:knowledge_sources_max).
// Counts non-deleted sources for the SPECIFIC bot (the limit is
// per-bot in the bundle copy).
export async function assertCanAddKnowledgeSource(
  orgId: string,
  botId: string,
): Promise<GateResult> {
  const max = await getLimit(orgId, "bots:knowledge_sources_max");
  if (max === Infinity) return { ok: true };
  const admin = createAdminClient();
  const { count } = await admin
    .from("bot_sources")
    .select("id", { count: "exact", head: true })
    .eq("bot_id", botId)
    .is("deleted_at", null);
  if ((count ?? 0) >= max) {
    return {
      ok: false,
      error: `This bot has reached its knowledge-source limit (${max}). Upgrade your plan to add more.`,
    };
  }
  return { ok: true };
}

// Team members — count cap (team_members:max). Counts active profiles
// in the org (org_id set, not soft-deleted) PLUS pending invites would
// ideally count too, but unconfirmed invites live in auth.users without
// a profile row yet; we count confirmed members only, which is the
// stable definition.
export async function assertCanInviteMember(orgId: string): Promise<GateResult> {
  const max = await getLimit(orgId, "team_members:max");
  if (max === Infinity) return { ok: true };
  const admin = createAdminClient();
  // Count active org members via memberships (multi-org: a member whose ACTIVE
  // workspace is another org still occupies a seat here).
  const { count } = await admin
    .from("memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if ((count ?? 0) >= max) {
    return {
      ok: false,
      error: `You've reached your team-member limit (${max}). Upgrade your plan to invite more.`,
    };
  }
  return { ok: true };
}

// Broadcasts — gated on the feature flag (feature:broadcasts) plus a
// monthly count cap (broadcasts:monthly). The monthly count uses the
// broadcasts table filtered to the current calendar month.
export async function assertCanCreateBroadcast(orgId: string): Promise<GateResult> {
  if (!(await hasFeature(orgId, "feature:broadcasts"))) {
    return {
      ok: false,
      error: "Broadcasts aren't included on your plan. Upgrade to send campaigns.",
    };
  }
  const max = await getLimit(orgId, "broadcasts:monthly");
  if (max === Infinity) return { ok: true };
  const admin = createAdminClient();
  // First day of the current month, UTC.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count } = await admin
    .from("broadcasts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", monthStart)
    .is("deleted_at", null);
  if ((count ?? 0) >= max) {
    return {
      ok: false,
      error: `You've used all ${max} broadcasts for this month. Upgrade for more.`,
    };
  }
  return { ok: true };
}

// Automations — feature flag only (feature:automations). No count cap
// today; bundles all grant it true, but a custom deal could disable it.
export async function assertCanUseAutomations(orgId: string): Promise<GateResult> {
  if (!(await hasFeature(orgId, "feature:automations"))) {
    return {
      ok: false,
      error: "Automations aren't included on your plan.",
    };
  }
  return { ok: true };
}

// Re-export for convenience so callers import from one place.
export { isProvisioned };
