import "server-only";
import type { CrmClient, CrmContactInput, CrmUpsertResult, OAuthTokens } from "./types";

// HubSpot CRM via public-app OAuth2. Specs verified against current docs 2026-06.
// Access tokens last 30 min; refresh tokens are long-lived (re-use; HubSpot may
// return a new one — persist it). Contacts are upserted by email to avoid dupes.

const AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const API = "https://api.hubapi.com";
const SCOPES = "crm.objects.contacts.read crm.objects.contacts.write";

function appUrl(path = ""): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://xyra-chat.vercel.app"}${path}`;
}

export function hubspotConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);
}

export function hubspotRedirectUri(): string {
  return appUrl("/api/auth/hubspot/callback");
}

export function buildHubspotAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID ?? "",
    redirect_uri: hubspotRedirectUri(),
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const j = (await res.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; expires_in?: number; message?: string }
    | null;
  if (!res.ok || !j?.access_token) {
    throw new Error(j?.message ?? `HubSpot token error (HTTP ${res.status})`);
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresInSec: j.expires_in ?? 1800,
    scope: SCOPES,
  };
}

export async function exchangeHubspotCode(code: string): Promise<OAuthTokens> {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    client_id: process.env.HUBSPOT_CLIENT_ID ?? "",
    client_secret: process.env.HUBSPOT_CLIENT_SECRET ?? "",
    redirect_uri: hubspotRedirectUri(),
    code,
  });
  // Identify the portal for the UI label (token is bound to one hub).
  let accountLabel: string | null = null;
  try {
    const r = await fetch(`${API}/oauth/v1/access-tokens/${tokens.accessToken}`);
    const meta = (await r.json().catch(() => null)) as { hub_domain?: string; hub_id?: number } | null;
    accountLabel = meta?.hub_domain ?? (meta?.hub_id ? `Portal ${meta.hub_id}` : null);
  } catch {
    /* label is cosmetic */
  }
  return { ...tokens, accountLabel };
}

export async function refreshHubspotToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresInSec: number; refreshToken?: string }> {
  const t = await tokenRequest({
    grant_type: "refresh_token",
    client_id: process.env.HUBSPOT_CLIENT_ID ?? "",
    client_secret: process.env.HUBSPOT_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
  });
  return { accessToken: t.accessToken, expiresInSec: t.expiresInSec, refreshToken: t.refreshToken };
}

// Map our contact shape → HubSpot's flat lowercase properties.
function toProperties(input: CrmContactInput): Record<string, string> {
  let firstname = input.firstName ?? undefined;
  let lastname = input.lastName ?? undefined;
  if (!firstname && !lastname && input.fullName) {
    const parts = input.fullName.trim().split(/\s+/);
    firstname = parts[0];
    if (parts.length > 1) lastname = parts.slice(1).join(" ");
  }
  const props: Record<string, string> = {};
  if (input.email) props.email = input.email;
  if (input.phone) props.phone = input.phone;
  if (firstname) props.firstname = firstname;
  if (lastname) props.lastname = lastname;
  return props;
}

export const hubspotClient: CrmClient = {
  async upsertContact(accessToken: string, _apiBase: string | null, input: CrmContactInput): Promise<CrmUpsertResult> {
    const properties = toProperties(input);
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    // With an email we can upsert (create-or-update) by it → no duplicates.
    if (input.email) {
      const res = await fetch(`${API}/crm/v3/objects/contacts/batch/upsert`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inputs: [{ idProperty: "email", id: input.email, properties }] }),
      });
      const j = (await res.json().catch(() => null)) as { results?: Array<{ id?: string }>; message?: string } | null;
      if (!res.ok) throw new Error(j?.message ?? `HubSpot upsert error (HTTP ${res.status})`);
      return { id: j?.results?.[0]?.id ?? null };
    }

    // No email → can't dedupe; create only if we have something to write.
    if (Object.keys(properties).length === 0) return { id: null };
    const res = await fetch(`${API}/crm/v3/objects/contacts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ properties }),
    });
    const j = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) throw new Error(j?.message ?? `HubSpot create error (HTTP ${res.status})`);
    return { id: j?.id ?? null };
  },
};
