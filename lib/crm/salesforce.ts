import "server-only";
import type { CrmClient, CrmContactInput, CrmUpsertResult, OAuthTokens } from "./types";

// Salesforce CRM via OAuth2 web-server flow. Specs per developer.salesforce.com
// 2026-06. The token response carries `instance_url` (the org's API base) which
// all REST calls must use. Access tokens are session-bound (no expires_in);
// `refresh_token` scope keeps us connected offline. Contacts require LastName.
const AUTH_URL = "https://login.salesforce.com/services/oauth2/authorize";
const TOKEN_URL = "https://login.salesforce.com/services/oauth2/token";
const API_VERSION = "v60.0";
const SCOPES = "api refresh_token";

function appUrl(path = ""): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://xyra-chat.vercel.app"}${path}`;
}

export function salesforceConfigured(): boolean {
  return Boolean(process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET);
}

export function salesforceRedirectUri(): string {
  return appUrl("/api/auth/salesforce/callback");
}

export function buildSalesforceAuthUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SALESFORCE_CLIENT_ID ?? "",
    redirect_uri: salesforceRedirectUri(),
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

type SfTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  instance_url?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const j = (await res.json().catch(() => null)) as SfTokenResponse | null;
  if (!res.ok || !j?.access_token) {
    throw new Error(
      j?.error_description ?? j?.error ?? `Salesforce token error (HTTP ${res.status})`,
    );
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    // Salesforce access tokens have no fixed lifetime; refresh conservatively.
    expiresInSec: 7200,
    scope: j.scope ?? SCOPES,
    apiBase: j.instance_url ?? null,
  };
}

export async function exchangeSalesforceCode(code: string): Promise<OAuthTokens> {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    client_id: process.env.SALESFORCE_CLIENT_ID ?? "",
    client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? "",
    redirect_uri: salesforceRedirectUri(),
  });
  let accountLabel: string | null = null;
  try {
    if (tokens.apiBase) accountLabel = new URL(tokens.apiBase).hostname;
  } catch {
    /* label is cosmetic */
  }
  return { ...tokens, accountLabel };
}

export async function refreshSalesforceToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresInSec: number; refreshToken?: string }> {
  const t = await tokenRequest({
    grant_type: "refresh_token",
    client_id: process.env.SALESFORCE_CLIENT_ID ?? "",
    client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
  });
  // Salesforce doesn't rotate the refresh token on refresh.
  return { accessToken: t.accessToken, expiresInSec: t.expiresInSec };
}

// Map our contact → Salesforce Contact fields. LastName is REQUIRED by SF.
function toFields(input: CrmContactInput): Record<string, string> {
  let firstName = input.firstName ?? undefined;
  let lastName = input.lastName ?? undefined;
  if (!lastName && input.fullName) {
    const parts = input.fullName.trim().split(/\s+/);
    if (parts.length > 1) {
      firstName = firstName ?? parts[0];
      lastName = parts.slice(1).join(" ");
    } else {
      lastName = parts[0];
    }
  }
  // SF rejects a Contact with no LastName — fall back to something stable.
  if (!lastName) lastName = firstName ?? input.email ?? input.phone ?? "Unknown";
  const f: Record<string, string> = { LastName: lastName };
  if (firstName) f.FirstName = firstName;
  if (input.email) f.Email = input.email;
  if (input.phone) f.Phone = input.phone;
  return f;
}

export const salesforceClient: CrmClient = {
  async upsertContact(
    accessToken: string,
    apiBase: string | null,
    input: CrmContactInput,
  ): Promise<CrmUpsertResult> {
    if (!apiBase) throw new Error("Salesforce connection missing instance_url");
    const base = `${apiBase}/services/data/${API_VERSION}`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    const fields = toFields(input);

    // Best-effort dedupe: SOQL by email, then PATCH; else create. SOQL can't be
    // parameterized in a raw query, so only run the dedupe for a clean,
    // normal-looking email (no quotes / backslashes / angle brackets / control
    // chars) — a malformed/hostile value skips the query and falls through to
    // create (which sends the value as a JSON field, not SOQL). Escape
    // backslash THEN quote as a second layer of defense.
    const cleanEmail =
      input.email && /^[^\s'"\\<>()]+@[^\s'"\\<>()]+\.[^\s'"\\<>()]+$/.test(input.email)
        ? input.email
        : null;
    if (cleanEmail) {
      try {
        const esc = cleanEmail.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        const soql = `SELECT Id FROM Contact WHERE Email = '${esc}' LIMIT 1`;
        const qRes = await fetch(`${base}/query?q=${encodeURIComponent(soql)}`, { headers });
        const qj = (await qRes.json().catch(() => null)) as
          | { records?: Array<{ Id?: string }> }
          | null;
        const existingId = qj?.records?.[0]?.Id;
        if (existingId) {
          await fetch(`${base}/sobjects/Contact/${existingId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(fields),
          });
          return { id: existingId };
        }
      } catch {
        /* query failed — fall through to create */
      }
    }
    const res = await fetch(`${base}/sobjects/Contact`, {
      method: "POST",
      headers,
      body: JSON.stringify(fields),
    });
    const j = (await res.json().catch(() => null)) as
      | { id?: string; success?: boolean; message?: string }
      | Array<{ message?: string }>
      | null;
    if (!res.ok) {
      const msg = Array.isArray(j) ? j[0]?.message : j?.message;
      throw new Error(msg ?? `Salesforce create error (HTTP ${res.status})`);
    }
    return { id: (j as { id?: string })?.id ?? null };
  },
};
