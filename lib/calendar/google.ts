import "server-only";
import type { CalendarClient, CalendarRef, CreateEventInput, BusySlot, FreeBusyQuery, OAuthTokens } from "./types";

// Google Calendar API v3 + Google OAuth2 (server-side "web application" client).
// Specs verified against current docs 2026-06. Tokens are exchanged/refreshed
// here; the facade (connections.ts) handles Vault storage + refresh-on-expiry.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
// Least-privilege: free/busy + event create, plus openid/email to capture which
// account connected. Avoids the broad calendar / calendar.readonly scopes.
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function appUrl(path = ""): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://xyra-chat.vercel.app"}${path}`;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return appUrl("/api/auth/google-calendar/callback");
}

// Browser-redirect authorize URL. access_type=offline + prompt=consent are what
// guarantee a refresh_token (Google only returns it on first consent otherwise).
export function buildGoogleAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
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
    | { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
    | null;
  if (!res.ok || !j?.access_token) {
    throw new Error(j?.error_description ?? j?.error ?? `Google token error (HTTP ${res.status})`);
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresInSec: j.expires_in ?? 3600,
    scope: j.scope,
  };
}

export async function exchangeGoogleCode(code: string): Promise<OAuthTokens & { email: string | null }> {
  const tokens = await tokenRequest({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  let email: string | null = null;
  try {
    const r = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    const u = (await r.json().catch(() => null)) as { email?: string } | null;
    email = u?.email ?? null;
  } catch {
    /* email is cosmetic — connection still works */
  }
  return { ...tokens, email };
}

export async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; expiresInSec: number }> {
  const t = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  });
  return { accessToken: t.accessToken, expiresInSec: t.expiresInSec };
}

export const googleClient: CalendarClient = {
  async freeBusy(ref: CalendarRef, q: FreeBusyQuery): Promise<BusySlot[]> {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${ref.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: q.fromIso, timeMax: q.toIso, items: [{ id: ref.calendarId }] }),
    });
    const j = (await res.json().catch(() => null)) as
      | { calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>; error?: { message?: string } }
      | null;
    if (!res.ok) throw new Error(j?.error?.message ?? `Google freeBusy error (HTTP ${res.status})`);
    const cal = j?.calendars?.[ref.calendarId];
    return (cal?.busy ?? []).map((b) => ({ startIso: b.start, endIso: b.end }));
  },

  async createEvent(ref: CalendarRef, input: CreateEventInput) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ref.calendarId)}/events?sendUpdates=all`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${ref.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: input.title,
        description: input.description,
        location: input.location,
        start: { dateTime: input.startIso, timeZone: input.timeZone },
        end: { dateTime: input.endIso, timeZone: input.timeZone },
        attendees: (input.attendeeEmails ?? []).map((email) => ({ email })),
      }),
    });
    const j = (await res.json().catch(() => null)) as { id?: string; htmlLink?: string; error?: { message?: string } } | null;
    if (!res.ok || !j?.id) throw new Error(j?.error?.message ?? `Google createEvent error (HTTP ${res.status})`);
    return { id: j.id, htmlLink: j.htmlLink };
  },
};
