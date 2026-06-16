# Design: Calendar integration (Google + Outlook)

The founder's flagship "we remove your workload" selling point. Lets the
booking-objective bot (and agents) see availability and create/manage events on
the customer's own calendar. Built before launch to strengthen the pitch (not
launch-blocking — Meta is).

## Goal
1. An owner/admin connects their **Google Calendar** and/or **Microsoft Outlook**
   calendar to the workspace via OAuth.
2. The **booking bot** can: check free/busy, propose slots, and create an event
   (with the customer as attendee) — turning "what's a good time?" chats into
   booked meetings automatically.
3. Agents see upcoming events / can create one from a conversation.

## Providers (both REST, OAuth2)
- **Google Calendar API** — OAuth2 (offline access → refresh token). Scopes:
  `https://www.googleapis.com/auth/calendar.events` (+ `.../calendar.readonly`
  for free/busy). Endpoints: freebusy.query, events.insert/list/patch.
- **Microsoft Graph (Outlook)** — OAuth2 (Azure AD app). Scopes:
  `Calendars.ReadWrite` + `offline_access`. Endpoints: /me/calendar/getSchedule
  (free/busy), /me/events.
- ⚠️ Build against the CURRENT docs (fetch via context7/web at implementation
  time — both APIs + OAuth flows churn). Pin Graph + Google API versions.

## Data model (migration 056)
`calendar_connections`:
- id, org_id (FK), provider ('google'|'microsoft'), connected_by (profile),
  account_email, calendar_id (default 'primary'), access_token_vault_id,
  refresh_token_vault_id, token_expires_at, scopes, status
  ('active'|'revoked'|'error'), last_sync_at, created_at, deleted_at.
- Tokens in **Supabase Vault** (same pattern as channel tokens) — only the vault
  UUIDs live on the row. RLS: org members read; service-role writes. GRANTs.
- UNIQUE(org_id, provider, account_email) where deleted_at IS NULL.

## OAuth routes (mirror the IG/Messenger pattern, env-gated)
- `GET /api/auth/google-calendar/start` + `/callback`
- `GET /api/auth/microsoft-calendar/start` + `/callback`
- httpOnly state cookie (CSRF), code→token exchange POSTs creds in the BODY,
  refresh tokens stored in Vault, refresh-on-expiry helper.
- **Env-gated**: connect buttons only render when the provider's client id/secret
  are set (so untested-against-real-provider code can't break prod — same safety
  pattern as the Meta OAuth buttons). Manual entry is NOT applicable here (OAuth
  only), so the buttons simply hide until configured.

## Bot tool (extends the Week-7 tool-use)
- New bot tool `book_meeting` / `check_availability`: the booking-objective bot
  calls free/busy then proposes/creates an event. Outcome logged to bot_outcomes
  (`booking_created`). Gate behind a connected calendar; degrade gracefully
  (fall back to sharing a booking link) when none connected.

## Library
- `lib/calendar/google.ts` + `lib/calendar/microsoft.ts` — thin clients
  (freeBusy, createEvent, refreshToken). `lib/calendar/index.ts` — provider-
  agnostic facade the bot + UI call.
- `lib/calendar/actions.ts` — connect/disconnect server actions (owner/admin),
  Vault writes, RLS-safe.

## UI
- `/settings/integrations` (or a Calendar card under settings) — connect/disconnect
  Google + Outlook, show connected account + status.
- Inbox: a "Book" affordance on a conversation (agent-initiated) — later polish.

## Env (new, all optional → feature hidden until set)
- `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET`
  (+ `NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED` or derive from a public client id)
- `MICROSOFT_CALENDAR_CLIENT_ID` / `MICROSOFT_CALENDAR_CLIENT_SECRET` / tenant
- Redirect URIs to register: `https://xyra-chat.vercel.app/api/auth/{google,microsoft}-calendar/callback`

## Security
- Tokens in Vault, never on the row / never client-exposed.
- OAuth state cookie (CSRF); validate redirect.
- Per-org isolation: a connection belongs to one org; the bot only reads the
  conversation's org's calendar.
- Adversarial review before enabling (token handling, SSRF on any user-provided
  calendar URLs — none expected, OAuth only).

## Build order
1. Migration 056 + Vault plumbing + the provider-agnostic facade (testable).
2. Google OAuth + client (most common first).
3. Microsoft OAuth + client.
4. Bot `book_meeting` tool + booking-objective wiring.
5. Settings UI (connect/disconnect).
6. Adversarial review.

## Deferred (post-MVP)
- Two-way sync / webhooks (Google push channels, Graph subscriptions) — MVP is
  on-demand free/busy + create.
- Calendly/Cal.com import; multiple calendars per provider; team-member-level
  (vs org-level) connections.
