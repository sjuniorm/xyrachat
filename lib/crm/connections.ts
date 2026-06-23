import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret, vaultReadSecret, vaultUpdateSecret, vaultForgetSecret } from "@/lib/supabase/vault";
import { hubspotClient, refreshHubspotToken } from "./hubspot";
import { pipedriveClient, refreshPipedriveToken } from "./pipedrive";
import { salesforceClient, refreshSalesforceToken } from "./salesforce";
import type { CrmClient, CrmConnectionRow, CrmContactInput, CrmProvider, OAuthTokens } from "./types";

// Provider-agnostic CRM facade: the contact-sync hook + UI call THESE. Token
// storage (Vault), refresh-on-expiry, and provider dispatch live here. Mirrors
// lib/calendar/connections.ts.

function clientFor(provider: CrmProvider): CrmClient | null {
  switch (provider) {
    case "hubspot": return hubspotClient;
    case "pipedrive": return pipedriveClient;
    case "salesforce": return salesforceClient;
    default: return null;
  }
}
function refreshFor(provider: CrmProvider, refreshToken: string) {
  switch (provider) {
    case "hubspot": return refreshHubspotToken(refreshToken);
    case "pipedrive": return refreshPipedriveToken(refreshToken);
    case "salesforce": return refreshSalesforceToken(refreshToken);
    default: return null;
  }
}

const COLUMNS =
  "id, org_id, provider, connected_by, account_label, api_base, access_token_vault_id, refresh_token_vault_id, token_expires_at, scopes, status, error_message, last_sync_at";

export async function getActiveCrmConnection(
  orgId: string,
  provider?: CrmProvider,
): Promise<CrmConnectionRow | null> {
  const admin = createAdminClient();
  let q = admin
    .from("crm_connections")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (provider) q = q.eq("provider", provider);
  const { data } = await q.maybeSingle();
  return (data as CrmConnectionRow | null) ?? null;
}

async function getValidAccessToken(conn: CrmConnectionRow): Promise<string | null> {
  const admin = createAdminClient();
  const stillValid =
    conn.token_expires_at && new Date(conn.token_expires_at).getTime() - Date.now() > 60_000;
  if (stillValid && conn.access_token_vault_id) {
    return vaultReadSecret(conn.access_token_vault_id);
  }
  if (!conn.refresh_token_vault_id) {
    return conn.access_token_vault_id ? vaultReadSecret(conn.access_token_vault_id) : null;
  }
  const refreshToken = await vaultReadSecret(conn.refresh_token_vault_id);
  if (!refreshToken) return null;
  const doRefresh = refreshFor(conn.provider, refreshToken);
  if (!doRefresh) return null;
  try {
    const refreshed = await doRefresh;
    let accessVaultId = conn.access_token_vault_id;
    if (accessVaultId) await vaultUpdateSecret(accessVaultId, refreshed.accessToken);
    else accessVaultId = await vaultCreateSecret(refreshed.accessToken, `crm-access-${conn.id}`, "crm access token");
    // Persist a rotated refresh token if the provider returned one.
    let refreshVaultId = conn.refresh_token_vault_id;
    if (refreshed.refreshToken) {
      if (refreshVaultId) await vaultUpdateSecret(refreshVaultId, refreshed.refreshToken);
      else refreshVaultId = await vaultCreateSecret(refreshed.refreshToken, `crm-refresh-${conn.id}`, "crm refresh token");
    }
    await admin
      .from("crm_connections")
      .update({
        access_token_vault_id: accessVaultId,
        refresh_token_vault_id: refreshVaultId,
        token_expires_at: new Date(Date.now() + refreshed.expiresInSec * 1000).toISOString(),
        status: "active",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    return refreshed.accessToken;
  } catch (err) {
    await admin
      .from("crm_connections")
      .update({ status: "error", error_message: err instanceof Error ? err.message : "refresh failed", updated_at: new Date().toISOString() })
      .eq("id", conn.id);
    return null;
  }
}

// Push a contact/lead into the org's connected CRM. Returns false (never throws)
// when no CRM is connected or the call fails — callers fire-and-forget.
export async function syncContactToCrm(orgId: string, input: CrmContactInput): Promise<boolean> {
  if (!input.email && !input.phone && !input.fullName && !input.firstName) return false;
  const conn = await getActiveCrmConnection(orgId);
  if (!conn) return false;
  const client = clientFor(conn.provider);
  if (!client) return false;
  const token = await getValidAccessToken(conn);
  if (!token) return false;
  try {
    await client.upsertContact(token, conn.api_base, input);
    await createAdminClient()
      .from("crm_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", conn.id);
    return true;
  } catch {
    return false;
  }
}

export async function saveCrmConnection(input: {
  orgId: string;
  provider: CrmProvider;
  connectedBy: string;
  tokens: OAuthTokens;
}): Promise<void> {
  const admin = createAdminClient();
  const accessVaultId = await vaultCreateSecret(input.tokens.accessToken, `crm-access-${input.orgId}-${input.provider}`, "crm access token");
  const refreshVaultId = input.tokens.refreshToken
    ? await vaultCreateSecret(input.tokens.refreshToken, `crm-refresh-${input.orgId}-${input.provider}`, "crm refresh token")
    : null;
  const expiresAt = new Date(Date.now() + input.tokens.expiresInSec * 1000).toISOString();

  const { data: existing } = await admin
    .from("crm_connections")
    .select("id, access_token_vault_id, refresh_token_vault_id")
    .eq("org_id", input.orgId)
    .eq("provider", input.provider)
    .is("deleted_at", null)
    .maybeSingle();

  const row = {
    connected_by: input.connectedBy,
    account_label: input.tokens.accountLabel ?? null,
    api_base: input.tokens.apiBase ?? null,
    access_token_vault_id: accessVaultId,
    refresh_token_vault_id: refreshVaultId,
    token_expires_at: expiresAt,
    scopes: input.tokens.scope ?? null,
    status: "active" as const,
    error_message: null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    if (existing.access_token_vault_id) await vaultForgetSecret(existing.access_token_vault_id).catch(() => {});
    if (existing.refresh_token_vault_id) await vaultForgetSecret(existing.refresh_token_vault_id).catch(() => {});
    await admin.from("crm_connections").update(row).eq("id", existing.id);
    return;
  }
  await admin.from("crm_connections").insert({ org_id: input.orgId, provider: input.provider, ...row });
}
