"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateApiKey, hashApiKey } from "./keys";
import { SCOPES, type Scope } from "./scopes";
import { PLANS, type PlanId } from "@/lib/billing/plans";

// Scopes that count as "write" — gated to plans with apiAccess='full'.
// Read-only access (apiAccess='read_only') is allowed everything ending
// in :read plus /me whoami.
const WRITE_SCOPES = new Set<Scope>([
  "contacts:write",
  "conversations:write",
  "messages:write",
  "bots:write",
  "broadcasts:write",
  "automations:write",
  "webhooks:write",
  "admin",
]);

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

// =====================================================================
// CREATE — returns the plaintext key ONCE. Caller must surface it to the
// user immediately; we never store the plaintext.
// =====================================================================
export async function createApiKey(input: {
  name: string;
  scopes: string[];
  expiresInDays?: number | null;
}): Promise<
  ActionResult<{
    id: string;
    plaintext: string;
    prefix: string;
    scopes: string[];
  }>
> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Key name is required." };

  // Reject any unknown scope so we don't end up with bogus rows.
  for (const s of input.scopes) {
    if (!SCOPES.includes(s as Scope)) {
      return { ok: false, error: `Unknown scope: ${s}` };
    }
  }
  if (input.scopes.length === 0) {
    return { ok: false, error: "Pick at least one scope." };
  }

  // Plan gate. Free can't create API keys; Starter can create read-only
  // keys; Pro+ can create full-write keys. When the admin panel lands,
  // these defaults stay as fallbacks while overrides live in the DB.
  const admin0 = createAdminClient();
  const { data: sub } = await admin0
    .from("subscriptions")
    .select("plan")
    .eq("org_id", auth.orgId)
    .maybeSingle();
  const plan = PLANS[(sub?.plan as PlanId) ?? "free"] ?? PLANS.free;
  if (plan.apiAccess === "none") {
    return {
      ok: false,
      error:
        "Public API access isn't included on your plan. Upgrade to Starter or Pro to generate keys.",
    };
  }
  if (plan.apiAccess === "read_only") {
    const hasWrite = input.scopes.some((s) => WRITE_SCOPES.has(s as Scope));
    if (hasWrite) {
      return {
        ok: false,
        error:
          "Your plan is read-only API access. Upgrade to Pro to generate keys with write scopes (messages:write, conversations:write, etc).",
      };
    }
  }

  const { plaintext, prefix } = generateApiKey();
  let hash: string;
  try {
    hash = hashApiKey(plaintext);
  } catch {
    return {
      ok: false,
      error:
        "API authentication is not configured — APP_PEPPER env var is missing on the server.",
    };
  }
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { data, error } = await admin0
    .from("api_keys")
    .insert({
      org_id: auth.orgId,
      name,
      key_prefix: prefix,
      key_hash: hash,
      scopes: input.scopes,
      expires_at: expiresAt,
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/api");
  return {
    ok: true,
    data: { id: data.id, plaintext, prefix, scopes: input.scopes },
  };
}

// =====================================================================
// REVOKE — sets revoked_at. Token still in DB for audit but useless.
// =====================================================================
export async function revokeApiKey(id: string): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("api_keys")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.org_id !== auth.orgId) {
    return { ok: false, error: "Key not in your org." };
  }
  const { error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/api");
  return { ok: true };
}

export async function deleteApiKey(id: string): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("api_keys")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.org_id !== auth.orgId) {
    return { ok: false, error: "Key not in your org." };
  }
  const { error } = await admin
    .from("api_keys")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/api");
  return { ok: true };
}
