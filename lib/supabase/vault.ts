import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Supabase Vault helpers. All operations require the service-role client.
// Vault must be enabled in: Project Settings → Vault.
//
// Never import this file from a client component. Never log decrypted values.

/**
 * Stores a secret in Supabase Vault and returns its UUID. Save the UUID in
 * your application table (e.g. channels.access_token_vault_id) — never the
 * raw secret itself.
 */
export async function vaultCreateSecret(
  value: string,
  name: string,
  description?: string,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_secret", {
    new_secret: value,
    new_name: name,
    new_description: description ?? "",
  });
  if (error || !data) {
    throw new Error(`Vault create_secret failed: ${error?.message ?? "no id returned"}`);
  }
  // create_secret returns the secret UUID as text.
  return String(data);
}

/**
 * Reads a decrypted secret by UUID. Service-role only.
 * Returns null if the secret does not exist.
 *
 * Calls the public.read_secret wrapper from migration 004 — direct access to
 * vault.decrypted_secrets isn't exposed via PostgREST.
 */
export async function vaultReadSecret(secretId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("read_secret", { secret_id: secretId });
  if (error) {
    throw new Error(`Vault read failed: ${error.message}`);
  }
  return (data as string | null) ?? null;
}

/**
 * Updates an existing vault secret. We use this when an access token rotates
 * (e.g. after a Meta token refresh).
 */
export async function vaultUpdateSecret(
  secretId: string,
  newValue: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("update_secret", {
    secret_id: secretId,
    new_secret: newValue,
    new_name: null,
    new_description: null,
  });
  if (error) throw new Error(`Vault update_secret failed: ${error.message}`);
}

/**
 * Soft-removes a secret. We keep the row in vault.secrets for audit but mark
 * for deletion — currently Supabase Vault has no built-in delete RPC; the
 * pattern is to overwrite with an empty value before forgetting the UUID.
 */
export async function vaultForgetSecret(secretId: string): Promise<void> {
  await vaultUpdateSecret(secretId, "");
}
