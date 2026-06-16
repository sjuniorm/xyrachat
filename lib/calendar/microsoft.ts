import "server-only";
import type { CalendarClient, CalendarRef, CreateEventInput, BusySlot, FreeBusyQuery, OAuthTokens } from "./types";

// Microsoft Graph calendar (Outlook / M365) via the Microsoft identity platform
// v2.0 endpoint. Specs verified against current docs 2026-06. Multi-tenant by
// default ("common"); override with MICROSOFT_TENANT for single-tenant apps.

const TENANT = process.env.MICROSOFT_TENANT || "common";
const AUTH_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
// offline_access → refresh tokens; Calendars.ReadWrite covers getSchedule + create.
const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "https://graph.microsoft.com/Calendars.ReadWrite",
  "https://graph.microsoft.com/User.Read",
].join(" ");

function appUrl(path = ""): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://xyra-chat.vercel.app"}${path}`;
}

export function microsoftConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function microsoftRedirectUri(): string {
  return appUrl("/api/auth/microsoft-calendar/callback");
}

export function buildMicrosoftAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
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
    | { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
    | null;
  if (!res.ok || !j?.access_token) {
    throw new Error(j?.error_description ?? j?.error ?? `Microsoft token error (HTTP ${res.status})`);
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresInSec: j.expires_in ?? 3600, scope: j.scope };
}

export async function exchangeMicrosoftCode(code: string): Promise<OAuthTokens & { email: string | null }> {
  const tokens = await tokenRequest({
    code,
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    redirect_uri: microsoftRedirectUri(),
    grant_type: "authorization_code",
    scope: SCOPES,
  });
  let email: string | null = null;
  try {
    const r = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    const u = (await r.json().catch(() => null)) as { mail?: string; userPrincipalName?: string } | null;
    email = u?.mail ?? u?.userPrincipalName ?? null;
  } catch {
    /* cosmetic */
  }
  return { ...tokens, email };
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{ accessToken: string; expiresInSec: number }> {
  const t = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    scope: SCOPES,
  });
  return { accessToken: t.accessToken, expiresInSec: t.expiresInSec };
}

// MS start/end dateTimes are LOCAL + a timeZone field — strip any Z/offset so
// the timeZone field is authoritative (Graph rejects offset-bearing dateTimes here).
function localPart(iso: string): string {
  return iso.replace(/(Z|[+-]\d{2}:?\d{2})$/, "");
}
function toUtcIso(dateTime: string): string {
  // getSchedule (requested in UTC) returns naive UTC — normalize to a Z instant.
  return /(Z|[+-]\d{2}:?\d{2})$/.test(dateTime) ? dateTime : `${dateTime}Z`;
}

export const microsoftClient: CalendarClient = {
  async freeBusy(ref: CalendarRef, q: FreeBusyQuery): Promise<BusySlot[]> {
    const schedule = ref.accountEmail;
    if (!schedule) return []; // getSchedule needs the mailbox address
    const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ref.accessToken}`,
        "Content-Type": "application/json",
        Prefer: 'outlook.timezone="UTC"',
      },
      body: JSON.stringify({
        schedules: [schedule],
        startTime: { dateTime: localPart(q.fromIso), timeZone: "UTC" },
        endTime: { dateTime: localPart(q.toIso), timeZone: "UTC" },
        availabilityViewInterval: 30,
      }),
    });
    const j = (await res.json().catch(() => null)) as
      | { value?: Array<{ scheduleItems?: Array<{ status?: string; start?: { dateTime: string }; end?: { dateTime: string } }> }>; error?: { message?: string } }
      | null;
    if (!res.ok) throw new Error(j?.error?.message ?? `Microsoft getSchedule error (HTTP ${res.status})`);
    const items = j?.value?.[0]?.scheduleItems ?? [];
    return items
      .filter((it) => ["busy", "oof", "tentative"].includes(it.status ?? ""))
      .filter((it) => it.start?.dateTime && it.end?.dateTime)
      .map((it) => ({ startIso: toUtcIso(it.start!.dateTime), endIso: toUtcIso(it.end!.dateTime) }));
  },

  async createEvent(ref: CalendarRef, input: CreateEventInput) {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${ref.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: input.title,
        body: input.description ? { contentType: "HTML", content: input.description } : undefined,
        start: { dateTime: localPart(input.startIso), timeZone: input.timeZone },
        end: { dateTime: localPart(input.endIso), timeZone: input.timeZone },
        location: input.location ? { displayName: input.location } : undefined,
        attendees: (input.attendeeEmails ?? []).map((address) => ({ emailAddress: { address }, type: "required" })),
      }),
    });
    const j = (await res.json().catch(() => null)) as { id?: string; webLink?: string; error?: { message?: string } } | null;
    if (!res.ok || !j?.id) throw new Error(j?.error?.message ?? `Microsoft createEvent error (HTTP ${res.status})`);
    return { id: j.id, htmlLink: j.webLink };
  },
};
