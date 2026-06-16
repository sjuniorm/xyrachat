import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret, vaultReadSecret, vaultUpdateSecret, vaultForgetSecret } from "@/lib/supabase/vault";
import { googleClient, refreshGoogleToken } from "./google";
import { microsoftClient, refreshMicrosoftToken } from "./microsoft";
import type {
  CalendarClient,
  CalendarConnectionRow,
  CalendarProvider,
  CalendarRef,
  CreateEventInput,
  CreatedEvent,
  BusySlot,
  FreeBusyQuery,
  OAuthTokens,
} from "./types";

// Provider-agnostic facade: the booking bot + UI call THESE; token storage,
// refresh-on-expiry, and provider dispatch all live here.

function clientFor(provider: CalendarProvider): CalendarClient {
  return provider === "google" ? googleClient : microsoftClient;
}

function refreshFor(provider: CalendarProvider, refreshToken: string) {
  return provider === "google" ? refreshGoogleToken(refreshToken) : refreshMicrosoftToken(refreshToken);
}

const COLUMNS =
  "id, org_id, provider, connected_by, account_email, calendar_id, access_token_vault_id, refresh_token_vault_id, token_expires_at, scopes, status, error_message, last_sync_at";

// The org's active calendar connection (optionally for a specific provider).
// If several are active, prefers the most recently connected.
export async function getActiveCalendarConnection(
  orgId: string,
  provider?: CalendarProvider,
): Promise<CalendarConnectionRow | null> {
  const admin = createAdminClient();
  let q = admin
    .from("calendar_connections")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (provider) q = q.eq("provider", provider);
  const { data } = await q.maybeSingle();
  return (data as CalendarConnectionRow | null) ?? null;
}

// Resolve a usable access token for a connection: read from Vault; if expired
// (or within 60s of it), refresh via the provider, persist the rotated token +
// new expiry, and return it. Returns null if the connection can't be used
// (marks it 'error' on a dead refresh token so the UI can prompt a reconnect).
async function getValidAccessToken(conn: CalendarConnectionRow): Promise<string | null> {
  const admin = createAdminClient();
  const stillValid =
    conn.token_expires_at && new Date(conn.token_expires_at).getTime() - Date.now() > 60_000;
  if (stillValid && conn.access_token_vault_id) {
    return vaultReadSecret(conn.access_token_vault_id);
  }
  if (!conn.refresh_token_vault_id) {
    // No refresh token (shouldn't happen for a healthy connection) — use the
    // current access token if present, else give up.
    return conn.access_token_vault_id ? vaultReadSecret(conn.access_token_vault_id) : null;
  }
  const refreshToken = await vaultReadSecret(conn.refresh_token_vault_id);
  if (!refreshToken) return null;
  try {
    const refreshed = await refreshFor(conn.provider, refreshToken);
    let accessVaultId = conn.access_token_vault_id;
    if (accessVaultId) {
      await vaultUpdateSecret(accessVaultId, refreshed.accessToken);
    } else {
      accessVaultId = await vaultCreateSecret(refreshed.accessToken, `cal-access-${conn.id}`, "calendar access token");
    }
    await admin
      .from("calendar_connections")
      .update({
        access_token_vault_id: accessVaultId,
        token_expires_at: new Date(Date.now() + refreshed.expiresInSec * 1000).toISOString(),
        status: "active",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    return refreshed.accessToken;
  } catch (err) {
    await admin
      .from("calendar_connections")
      .update({ status: "error", error_message: err instanceof Error ? err.message : "refresh failed", updated_at: new Date().toISOString() })
      .eq("id", conn.id);
    return null;
  }
}

async function resolveRef(conn: CalendarConnectionRow): Promise<CalendarRef | null> {
  const accessToken = await getValidAccessToken(conn);
  if (!accessToken) return null;
  return { accessToken, calendarId: conn.calendar_id, accountEmail: conn.account_email };
}

// ---- High-level ops the booking bot uses --------------------------------------
export async function orgCalendarFreeBusy(orgId: string, q: FreeBusyQuery): Promise<BusySlot[] | null> {
  const conn = await getActiveCalendarConnection(orgId);
  if (!conn) return null;
  const ref = await resolveRef(conn);
  if (!ref) return null;
  return clientFor(conn.provider).freeBusy(ref, q);
}

export async function orgCalendarCreateEvent(orgId: string, input: CreateEventInput): Promise<CreatedEvent | null> {
  const conn = await getActiveCalendarConnection(orgId);
  if (!conn) return null;
  const ref = await resolveRef(conn);
  if (!ref) return null;
  const created = await clientFor(conn.provider).createEvent(ref, input);
  await createAdminClient()
    .from("calendar_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", conn.id);
  return created;
}

// ---- Connect / disconnect (called by the OAuth callbacks + the action) --------
export async function saveCalendarConnection(input: {
  orgId: string;
  provider: CalendarProvider;
  connectedBy: string;
  email: string | null;
  tokens: OAuthTokens;
}): Promise<void> {
  const admin = createAdminClient();
  const accessVaultId = await vaultCreateSecret(input.tokens.accessToken, `cal-access-${input.orgId}-${input.provider}`, "calendar access token");
  const refreshVaultId = input.tokens.refreshToken
    ? await vaultCreateSecret(input.tokens.refreshToken, `cal-refresh-${input.orgId}-${input.provider}`, "calendar refresh token")
    : null;
  const expiresAt = new Date(Date.now() + input.tokens.expiresInSec * 1000).toISOString();

  // Re-connecting the same account → reuse the existing row (and forget its old
  // vault secrets) rather than violating the unique index.
  const { data: existing } = await admin
    .from("calendar_connections")
    .select("id, access_token_vault_id, refresh_token_vault_id")
    .eq("org_id", input.orgId)
    .eq("provider", input.provider)
    .eq("account_email", input.email)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    if (existing.access_token_vault_id) await vaultForgetSecret(existing.access_token_vault_id).catch(() => {});
    if (existing.refresh_token_vault_id) await vaultForgetSecret(existing.refresh_token_vault_id).catch(() => {});
    await admin
      .from("calendar_connections")
      .update({
        connected_by: input.connectedBy,
        access_token_vault_id: accessVaultId,
        refresh_token_vault_id: refreshVaultId,
        token_expires_at: expiresAt,
        scopes: input.tokens.scope ?? null,
        status: "active",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await admin.from("calendar_connections").insert({
    org_id: input.orgId,
    provider: input.provider,
    connected_by: input.connectedBy,
    account_email: input.email,
    access_token_vault_id: accessVaultId,
    refresh_token_vault_id: refreshVaultId,
    token_expires_at: expiresAt,
    scopes: input.tokens.scope ?? null,
    status: "active",
  });
}
