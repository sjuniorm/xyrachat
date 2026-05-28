import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Entitlements — single source of truth for "what can this org do?"
//
// Every gate (channel creation, AI call, broadcast send, etc.) calls
// `checkEntitlement(orgId, 'feature_key')` instead of comparing plan
// strings. Bundles in lib/billing/bundles.ts provision entitlements
// via the Stripe webhook; per-org overrides (custom deals, manual
// grants, promo codes) layer on top by inserting rows with a
// different `source`.
//
// VALUE shape (TEXT in the DB so we don't need a column-type per type):
//   - Numeric limit:  '1000' (positive) or '-1' (unlimited)
//   - Boolean flag:   'true' / 'false'
//   - String:         arbitrary, used rarely
//
// PRECEDENCE: when multiple rows exist for the same (org, feature_key)
// from different sources (bundle + custom_quote + manual), we pick the
// MOST PERMISSIVE active row. For numerics: largest value wins
// (-1/unlimited beats any finite). For booleans: true wins.
// =====================================================================

export type FeatureKey =
  // Channel limits / availability
  | "channels:max"
  | "channels:whatsapp"
  | "channels:instagram"
  | "channels:telegram"
  | "channels:email"
  // Team
  | "team_members:max"
  // Bots
  | "bots:max"
  | "bots:knowledge_sources_max"
  | "bots:voice_transcription"
  // AI token budget (monthly)
  | "ai_tokens:monthly"
  // Broadcasts
  | "feature:broadcasts"
  | "broadcasts:monthly"
  | "broadcasts:wa_conversations_included"
  // Automations
  | "feature:automations"
  // Public API
  | "api:read"
  | "api:write"
  | "api:requests_per_min"
  | "api:webhook_deliveries_monthly"
  // Integrations
  | "integration:make"
  | "integration:zapier"
  | "integration:n8n"
  // White-label / enterprise
  | "feature:whitelabel"
  | "feature:priority_support"
  | "feature:custom_integrations";

// In-request cache so a single API request hitting checkEntitlement()
// multiple times for the same key doesn't issue N DB queries. Lives
// for one request; cleared between requests since we re-instantiate
// the admin client each call.
type CacheEntry = { value: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5_000;

function cacheKey(orgId: string, feature: FeatureKey): string {
  return `${orgId}::${feature}`;
}

// Returns the effective value (after precedence resolution) for a
// feature, or null if no entitlement row exists for the org.
export async function getEntitlement(
  orgId: string,
  feature: FeatureKey,
): Promise<string | null> {
  const key = cacheKey(orgId, feature);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("org_entitlements")
    .select("value")
    .eq("org_id", orgId)
    .eq("feature_key", feature)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  const rows = (data ?? []) as Array<{ value: string }>;
  if (rows.length === 0) {
    cache.set(key, { value: "", expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }
  const effective = pickMostPermissive(rows.map((r) => r.value));
  cache.set(key, { value: effective, expiresAt: Date.now() + CACHE_TTL_MS });
  return effective;
}

// Returns ALL entitlements for an org as a map. Useful for the billing
// settings page + the admin entitlements UI.
export async function getAllEntitlements(
  orgId: string,
): Promise<Map<string, Array<{ value: string; source: string; expires_at: string | null }>>> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("org_entitlements")
    .select("feature_key, value, source, expires_at")
    .eq("org_id", orgId)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("feature_key", { ascending: true });

  const out = new Map<string, Array<{ value: string; source: string; expires_at: string | null }>>();
  for (const row of (data ?? []) as Array<{
    feature_key: string;
    value: string;
    source: string;
    expires_at: string | null;
  }>) {
    const list = out.get(row.feature_key) ?? [];
    list.push({ value: row.value, source: row.source, expires_at: row.expires_at });
    out.set(row.feature_key, list);
  }
  return out;
}

// Boolean check — true if any active row for the feature evaluates to true.
export async function hasFeature(
  orgId: string,
  feature: FeatureKey,
): Promise<boolean> {
  const v = await getEntitlement(orgId, feature);
  return v === "true";
}

// Numeric limit — returns the max from all active rows, or 0 if none.
// -1 sentinel value means "unlimited" (returned as Infinity for easy
// math: `count < limit` always passes).
export async function getLimit(
  orgId: string,
  feature: FeatureKey,
): Promise<number> {
  const v = await getEntitlement(orgId, feature);
  if (v === null) return 0;
  if (v === "-1") return Infinity;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

// Check + return rich result for UIs that want to show "12 of 50 used".
export type LimitCheck = {
  allowed: boolean;
  current: number;
  max: number;
  unlimited: boolean;
};

export async function checkLimit(
  orgId: string,
  feature: FeatureKey,
  currentCount: number,
): Promise<LimitCheck> {
  const max = await getLimit(orgId, feature);
  const unlimited = max === Infinity;
  return {
    allowed: unlimited || currentCount < max,
    current: currentCount,
    max: unlimited ? Number.MAX_SAFE_INTEGER : max,
    unlimited,
  };
}

// Throwable variant. Use in code paths where we want a hard stop and
// the API layer maps the EntitlementError to a 402 / 403 response.
export class EntitlementError extends Error {
  constructor(
    public feature: FeatureKey,
    public reason: "missing" | "limit_reached",
    public current?: number,
    public max?: number,
  ) {
    super(
      reason === "missing"
        ? `Your plan doesn't include ${feature}.`
        : `You've reached your ${feature} limit (${current}/${max}).`,
    );
    this.name = "EntitlementError";
  }
}

export async function requireFeature(
  orgId: string,
  feature: FeatureKey,
): Promise<void> {
  if (!(await hasFeature(orgId, feature))) {
    throw new EntitlementError(feature, "missing");
  }
}

export async function requireUnderLimit(
  orgId: string,
  feature: FeatureKey,
  currentCount: number,
): Promise<void> {
  const check = await checkLimit(orgId, feature, currentCount);
  if (!check.allowed) {
    throw new EntitlementError(feature, "limit_reached", check.current, check.max);
  }
}

// =====================================================================
// Helpers
// =====================================================================
function pickMostPermissive(values: string[]): string {
  // Boolean precedence: 'true' wins
  if (values.some((v) => v === "true")) return "true";
  if (values.every((v) => v === "false")) return "false";
  // Numeric precedence: -1 (unlimited) wins, else max
  if (values.includes("-1")) return "-1";
  const nums = values
    .map((v) => parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
  if (nums.length > 0) return String(Math.max(...nums));
  // Fallback: first value (rare — would only hit for string entitlements)
  return values[0] ?? "";
}

// Test-only — exported so unit tests can reset the in-process cache
// between assertions. Not for production use.
export function _clearEntitlementCache(): void {
  cache.clear();
}
