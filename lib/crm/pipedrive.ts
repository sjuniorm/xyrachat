import "server-only";
import type { CrmClient, CrmContactInput, CrmUpsertResult, OAuthTokens } from "./types";

// Pipedrive CRM via marketplace OAuth2. Specs per developers.pipedrive.com 2026-06.
// Token endpoint lives on oauth.pipedrive.com and uses HTTP Basic auth
// (base64(client_id:client_secret)); the token response carries `api_domain`
// (the company-specific base, e.g. https://acme.pipedrive.com) which all API
// calls must use. Access tokens last 1h; refresh tokens are long-lived.
const AUTH_URL = "https://oauth.pipedrive.com/oauth/authorize";
const TOKEN_URL = "https://oauth.pipedrive.com/oauth/token";
// contacts:full = create/read persons. (base alone is read-mostly.)
const SCOPES = "contacts:full";

function appUrl(path = ""): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://xyra-chat.vercel.app"}${path}`;
}

export function pipedriveConfigured(): boolean {
  return Boolean(process.env.PIPEDRIVE_CLIENT_ID && process.env.PIPEDRIVE_CLIENT_SECRET);
}

export function pipedriveRedirectUri(): string {
  return appUrl("/api/auth/pipedrive/callback");
}

export function buildPipedriveAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.PIPEDRIVE_CLIENT_ID ?? "",
    redirect_uri: pipedriveRedirectUri(),
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

function basicAuthHeader(): string {
  const id = process.env.PIPEDRIVE_CLIENT_ID ?? "";
  const secret = process.env.PIPEDRIVE_CLIENT_SECRET ?? "";
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function tokenRequest(body: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      // Pipedrive expects the client creds in a Basic header, NOT the body.
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const j = (await res.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        api_domain?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      }
    | null;
  if (!res.ok || !j?.access_token) {
    throw new Error(
      j?.error_description ?? j?.error ?? `Pipedrive token error (HTTP ${res.status})`,
    );
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresInSec: j.expires_in ?? 3600,
    scope: j.scope ?? SCOPES,
    apiBase: j.api_domain ?? null,
  };
}

export async function exchangePipedriveCode(code: string): Promise<OAuthTokens> {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: pipedriveRedirectUri(),
  });
  // Label the connection by its company domain (derived from api_domain host).
  let accountLabel: string | null = null;
  try {
    if (tokens.apiBase) accountLabel = new URL(tokens.apiBase).hostname;
  } catch {
    /* label is cosmetic */
  }
  return { ...tokens, accountLabel };
}

export async function refreshPipedriveToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresInSec: number; refreshToken?: string }> {
  const t = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return { accessToken: t.accessToken, expiresInSec: t.expiresInSec, refreshToken: t.refreshToken };
}

// Map our contact → a Pipedrive person. Pipedrive requires a non-empty name.
function toPerson(input: CrmContactInput): Record<string, unknown> {
  const name =
    input.fullName?.trim() ||
    [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
    input.email ||
    input.phone ||
    "Unknown";
  const person: Record<string, unknown> = { name };
  if (input.email) person.email = [{ value: input.email, primary: true }];
  if (input.phone) person.phone = [{ value: input.phone, primary: true }];
  return person;
}

export const pipedriveClient: CrmClient = {
  async upsertContact(
    accessToken: string,
    apiBase: string | null,
    input: CrmContactInput,
  ): Promise<CrmUpsertResult> {
    if (!apiBase) throw new Error("Pipedrive connection missing api_domain");
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    // Best-effort dedupe by email via search before creating.
    if (input.email) {
      try {
        const sRes = await fetch(
          `${apiBase}/api/v1/persons/search?${new URLSearchParams({
            term: input.email,
            fields: "email",
            exact_match: "true",
            limit: "1",
          })}`,
          { headers },
        );
        const sj = (await sRes.json().catch(() => null)) as
          | { data?: { items?: Array<{ item?: { id?: number } }> } }
          | null;
        const existingId = sj?.data?.items?.[0]?.item?.id;
        if (existingId) {
          await fetch(`${apiBase}/api/v1/persons/${existingId}`, {
            method: "PUT",
            headers,
            body: JSON.stringify(toPerson(input)),
          });
          return { id: String(existingId) };
        }
      } catch {
        /* search failed — fall through to create */
      }
    }
    const res = await fetch(`${apiBase}/api/v1/persons`, {
      method: "POST",
      headers,
      body: JSON.stringify(toPerson(input)),
    });
    const j = (await res.json().catch(() => null)) as
      | { data?: { id?: number }; error?: string }
      | null;
    if (!res.ok) throw new Error(j?.error ?? `Pipedrive create error (HTTP ${res.status})`);
    return { id: j?.data?.id ? String(j.data.id) : null };
  },
};
