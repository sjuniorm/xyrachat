// Provider-agnostic calendar abstraction. The booking bot + UI talk to this;
// lib/calendar/google.ts + lib/calendar/microsoft.ts implement CalendarClient
// for each provider (filled in from the current-docs research). Pure types — no
// server-only imports — so it's safe to import anywhere.

export type CalendarProvider = "google" | "microsoft";

export type CalendarConnectionRow = {
  id: string;
  org_id: string;
  provider: CalendarProvider;
  connected_by: string | null;
  account_email: string | null;
  calendar_id: string;
  access_token_vault_id: string | null;
  refresh_token_vault_id: string | null;
  token_expires_at: string | null;
  scopes: string | null;
  status: "active" | "revoked" | "error";
  error_message: string | null;
  last_sync_at: string | null;
};

// A window to query availability over (ISO 8601 timestamps).
export type FreeBusyQuery = { fromIso: string; toIso: string };

// A busy block on the connected calendar.
export type BusySlot = { startIso: string; endIso: string };

export type CreateEventInput = {
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  timeZone: string; // IANA tz, e.g. "Europe/Madrid"
  attendeeEmails?: string[];
  location?: string;
};

export type CreatedEvent = { id: string; htmlLink?: string };

// What each provider module implements. The token is already resolved (Vault
// read + refreshed if expired) by the facade before these are called.
export interface CalendarClient {
  freeBusy(accessToken: string, calendarId: string, q: FreeBusyQuery): Promise<BusySlot[]>;
  createEvent(accessToken: string, calendarId: string, input: CreateEventInput): Promise<CreatedEvent>;
}

// OAuth token bundle returned by a provider's code-exchange / refresh.
export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string; // present on first consent (Google) / with offline_access
  expiresInSec: number;
  scope?: string;
};
