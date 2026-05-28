"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateApiKey, hashApiKey } from "./keys";
import { SCOPES, type Scope } from "./scopes";

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

  const admin = createAdminClient();
  const { data, error } = await admin
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
