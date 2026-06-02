# Xyra Chat — Project Memory (CLAUDE.md)

> Persistent context for future Claude Code sessions. Keep current.

## Product

**Xyra Chat** is a multi-platform customer messaging SaaS (think Superchat / ManyChat).
Owners connect channels (WhatsApp, Instagram DM, Messenger, web chat), agents reply
from a unified inbox, automations / bots / broadcasts run on top.

Reference: xyrachat.com

## Stack

- **Next.js 16** (App Router, Turbopack, React Compiler) — current stable. Project standard is **always latest stable** (see user feedback memory). When Next 17+ ships, bump and re-run smoke tests.
- **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4**
- **shadcn/ui** — Radix base, Nova preset, CSS variables, neutral base color (overridden by Xyra brand tokens)
- **Supabase** — Auth, Postgres + pgvector, Storage, Realtime
- **PostHog (EU host)** — analytics + feature flags. Session recording disabled for GDPR.
- **Vercel** — hosting via GitHub auto-deploy

## Brand tokens (must stay consistent)

| Token | Value | Usage |
|---|---|---|
| `--xyra-bg` | `#0B0418` | App background (dark) |
| `--xyra-sidebar` | `#1F1033` | Sidebar bg (dark purple) |
| `--xyra-purple` | `#9333EA` | Primary accent (purple-600) |
| `--xyra-pink` | `#EC4899` | Secondary accent (pink-500) |
| `--xyra-glow` | `#D882FF` | Signature glow (focus rings, halos) |
| Gradient | `linear-gradient(135deg, #9333EA 0%, #EC4899 100%)` | CTA buttons, logo wordmark |
| Font | `Inter` (next/font) | All UI text |

Tokens are defined in [app/globals.css](app/globals.css) and Tailwind v4 picks them up via `@theme`.

## ⚠️ Secrets policy — non-negotiable

**`.env.local` MUST NEVER be committed or pushed to GitHub.** The repo is
public (https://github.com/sjuniorm/xyrachat) — pushed secrets would be
immediately public.

Before any `git push`, the workflow is:
1. Run `git ls-files | grep -E "^\.env"`
2. If anything other than `.env.example` appears → STOP, do not push,
   investigate `.gitignore`
3. Only then push

`.gitignore` line 34 (`.env*`) plus line 35 (`!.env.example`) is the gate.
Touching either line requires re-verification that real envs are still ignored.

If a secret ever lands in a commit — even one that's been overwritten — assume
it's compromised, rotate it in the source provider (Supabase / PostHog), and
update Vercel + `.env.local` with the new value.

## Required environment variables

| Var | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Admin operations (GDPR delete, webhooks, Vault) — never expose to client |
| `NEXT_PUBLIC_POSTHOG_KEY` | client + server | PostHog project key |
| `NEXT_PUBLIC_POSTHOG_HOST` | client + server | `https://eu.i.posthog.com` (GDPR — EU hosting) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | server only | Random secret; user pastes the same value into Meta App Dashboard → WhatsApp → Configuration → Webhook → Verify Token |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | server only | Same idea as the WA one but used for `/api/webhooks/instagram` GET handshake. Keep distinct so each can be rotated independently. |
| `INSTAGRAM_APP_ID` | server only | App ID of the **Xyra Chat-IG** Meta app (the IG-specific one, separate from the WhatsApp app). Used for the Continue-with-Facebook OAuth flow on `/settings/channels/instagram/new`. Manual entry still works without it. |
| `INSTAGRAM_APP_SECRET` | server only | App secret of the **Xyra Chat-IG** Meta app. Used (a) to verify `X-Hub-Signature-256` on `/api/webhooks/instagram` (the IG webhook is signed with THIS secret, not `META_APP_SECRET`), and (b) to exchange the OAuth code for an access token. |
| `META_APP_SECRET` | server only | App secret of the **original** (WhatsApp) Meta app. Used for `X-Hub-Signature-256` HMAC verification on `/api/webhooks/whatsapp`. |
| `META_APP_ID` | server only | App ID of the original (WhatsApp) Meta app. Reserved for future WhatsApp Embedded Signup (Week 9). |
| `RESEND_API_KEY` | server only | Resend Dashboard → API Keys. Used for inbound webhook lookup + outbound `resend.emails.send()`. |
| `RESEND_WEBHOOK_SECRET` | server only | Resend Dashboard → Webhooks → Signing Secret (`whsec_<base64>` form). Verifies the Svix-format signature on inbound email webhooks. |
| `INBOUND_EMAIL_DOMAIN` | server only | Domain customers email — defaults to `mail.xyrachat.com`. MX records on this subdomain must point at Resend. |
| `EMAIL_FROM_ADDRESS` | server only | Fallback `From:` for outbound when a channel doesn't have its own `inbox_email`. Defaults to `support@xyrachat.com`. |
| `ANTHROPIC_API_KEY` | server only | Anthropic Console → API Keys. Powers bot replies (claude-sonnet-4-6), Message Assist + translate (claude-haiku-4-5-20251001), and the auto-translate background job. |
| `OPENAI_API_KEY` | server only | OpenAI Dashboard → API Keys. Used for RAG embeddings (text-embedding-3-small, 1536 dims) and future Whisper voice-note transcription. |
| `CRON_SECRET` | server only | Long random string (`openssl rand -hex 32`). Sent as `Authorization: Bearer <value>` by Vercel Cron when invoking `/api/cron/broadcasts` every 5 minutes to launch scheduled broadcasts. Also gates the internal-only `/api/broadcasts/send-internal` endpoint that the cron dispatches to. |
| `APP_PEPPER` | server only | Long random string (`openssl rand -base64 32`). Mixed into the SHA-256 hash for every API key. A leaked DB without the pepper still can't validate keys. **Never rotate** without re-issuing every API key in the database. |

WhatsApp + Instagram channel access tokens are NOT in env — they're stored
per-channel in Supabase Vault. Only the vault UUID lives in
`channels.access_token_vault_id`.

Local dev: copy `.env.example` → `.env.local`. Production: set in Vercel project settings (also via `vercel env add`).

## File structure (Week 1 baseline)

```
app/
  (auth)/
    layout.tsx              # Centered card, Xyra logo, gradient backdrop
    login/page.tsx          # Email + password sign-in (+ "Forgot password?" link)
    signup/page.tsx         # Name + email + password sign-up
    forgot-password/page.tsx # Request password reset email
    reset-password/page.tsx  # Set new password from recovery link
    accept-invite/page.tsx   # First-time invitees set password before /dashboard
    onboarding/page.tsx     # Create org, set self as owner
  (dashboard)/
    layout.tsx              # Branded sidebar (260px) + mobile header + content area (`h-dvh`)
    dashboard/page.tsx      # "Welcome to Xyra Chat" placeholder
    inbox/
      layout.tsx            # 3-panel inbox shell (client — usePathname for mobile flip)
      page.tsx              # Empty state ("Select a conversation")
      [id]/page.tsx         # Specific conversation: thread + contact panel
  api/
    ai/
      message-assist/route.ts    # Stubbed AI rewrite (Week 7 → real Claude)
      suggest-reply/route.ts     # Stubbed suggestion (Week 7 → real Claude)
      translate-inbound/route.ts # Stubbed inbound translation (Week 7)
    auth/
      instagram/
        start/route.ts           # Begin Meta OAuth (sets state cookie)
        callback/route.ts        # Code→token, list pages, save channel
    channels/
      whatsapp/send/route.ts     # POST text/template via Graph API
      instagram/send/route.ts    # POST text/image DM via Graph API
      telegram/send/route.ts     # POST text/photo via Telegram Bot API
      email/send/route.ts        # Outbound via Resend SDK + threading headers
    webhooks/
      whatsapp/route.ts          # Meta WA inbound + delivery webhooks
      instagram/route.ts         # Meta IG inbound + reactions + receipts
      telegram/route.ts          # Telegram inbound (header secret_token verify)
      email/route.ts             # Resend Inbound (Svix signature verify)
    gdpr/
      export/route.ts       # GET — JSON export of user/org data
      delete/route.ts       # POST — soft-delete user + org cascade
  privacy/page.tsx          # Placeholder — final legal text in Week 16
  terms/page.tsx            # Placeholder — final legal text in Week 16
  layout.tsx                # Root layout: Inter font, providers, sonner toaster
  globals.css               # Tailwind v4 + Xyra brand tokens + shadcn vars
  page.tsx                  # Marketing landing redirect → /login (or /dashboard if signed in)
  manifest.ts               # PWA manifest — Xyra brand colors, icons
  favicon.ico               # Browser tab fallback (legacy)
  icon.png                  # Browser tab icon (modern, 512×512, Next auto-scales)
  apple-icon.png            # iOS home screen icon (180×180)
components/
  ui/                       # shadcn primitives (button, input, card, sidebar, sheet, sonner, popover, tabs, textarea, switch, scroll-area, channel-icon, ...)
  brand/
    xyra-wordmark.tsx       # Two variants: `inline` (icon + gradient text) or `stacked` (full wordmark PNG)
  app/
    sidebar-nav.tsx         # Dashboard left nav
    sidebar-content.tsx     # Shared sidebar (used by desktop aside + mobile sheet)
    sidebar-user.tsx        # Avatar dropdown / sign-out
    mobile-header.tsx       # Hamburger header (md:hidden)
  inbox/
    conversation-list.tsx   # Search + filter tabs + items
    conversation-item.tsx   # Single row
    message-thread.tsx      # Top bar + grouped bubbles + composer
    message-bubble.tsx      # Bubble with inbound action menu (translate / copy / quote)
    contact-panel.tsx       # Right panel
    composer.tsx            # Textarea + AI Assist popover + Suggest + shortcuts
  consent/
    cookie-banner.tsx       # EU-only cookie banner (geo-detected)
  posthog-provider.tsx      # Client provider wrapping app
hooks/
  use-mobile.ts             # shadcn helper
lib/
  supabase/
    client.ts               # Browser client (createBrowserClient)
    server.ts               # RSC / route handler client (cookies)
    middleware.ts           # Session refresh helper for middleware.ts
    admin.ts                # Service-role client (server-only, GDPR + webhooks)
  i18n/languages.ts         # Top language list + label helper for translate menu
  analytics.ts              # PostHog browser client + identify/track/reset
  analytics-server.ts       # PostHog server client (`server-only`) — trackServer
  mock-data.ts              # Week 2 mock conversations / contacts / messages — replaced by real DB in Week 4
  utils.ts                  # shadcn cn() helper
middleware.ts               # Root: refresh session + route protection
supabase/
  migrations/
    001_initial.sql         # Schema for Week 1 (orgs, profiles, RLS, soft delete)
public/
  brand/
    logo.png                # 1024×1024 wordmark (X + "XYRA CHAT" stacked)
    logo-mark.png           # 1024×1024 X icon only
_brand-source/              # Original SVG/PNG/favicon export — gitignored, never shipped
.env.example                # Template — committed
.env.local                  # Real secrets — NEVER committed
```

## Database (Week 1)

Migration file: [supabase/migrations/001_initial.sql](supabase/migrations/001_initial.sql).

Tables: `organizations`, `profiles`. Both have `deleted_at TIMESTAMPTZ` for soft delete (GDPR baseline applies to ALL tables added in any week).

RLS enabled on both. Policies always include `AND deleted_at IS NULL`.

`pgvector` extension enabled now (Week 1) so future bot embeddings work without a follow-up migration.

`handle_new_user()` trigger auto-creates a `profiles` row on `auth.users` insert.

To apply: paste the SQL into Supabase SQL Editor, OR run `supabase db push` if Supabase CLI is linked.

## Auth flow

1. `/signup` → `supabase.auth.signUp()` → trigger inserts profile → redirect `/onboarding`
2. `/onboarding` → user enters org name → server action creates `organizations` row, links profile (`org_id`, `role='owner'`) → redirect `/dashboard`
3. `/login` → `supabase.auth.signInWithPassword()` → redirect `/dashboard`
4. Middleware refreshes session on every request and gates `/dashboard/*`

## Route protection rules (middleware)

- Unauthenticated visiting `/dashboard/*` → redirect `/login`
- Authenticated visiting `/login`, `/signup`, or `/forgot-password` → redirect `/dashboard`
- Public: `/`, `/privacy`, `/terms`, `/reset-password`, `/accept-invite`,
  `/api/gdpr/*` and `/api/webhooks/*` (which do their own auth)
- `/reset-password` and `/accept-invite` must stay public — both are landed
  on via a magic link that signs the user in, so an "authed → /dashboard"
  redirect would skip the password-setting step they're there for

## PostHog GDPR-safe configuration (locked decision)

Following spec section 9 option (a) — **session recording is disabled globally**. Simpler, zero risk of capturing customer message contents. Re-enable selectively later only if needed (and only with `maskAllInputs` + composer/bubble masking).

Browser init lives in [lib/analytics.ts](lib/analytics.ts) → `initPostHogBrowser()`, called from [components/posthog-provider.tsx](components/posthog-provider.tsx).

Tracked events (see `lib/analytics.ts`): `signup`, `org_created`, `channel_connected`, `message_sent`, `bot_created`, `broadcast_sent`, `upgrade_clicked`.

Identify on auth: `posthog.identify(userId, { org_id, plan })`.

## GDPR baseline (Week 1 — re-audit Week 15)

- Every table that holds or references org/PII data MUST have `deleted_at TIMESTAMPTZ`.
- Every RLS policy MUST include `AND deleted_at IS NULL` for every table referenced.
- Soft-delete only — never `DELETE`. Embeddings cascade via FK.
- Per-table `<table>_active` view pre-filters `deleted_at IS NULL`.
- `/api/gdpr/export` — right-of-access (returns JSON of all user + org data).
- `/api/gdpr/delete` — right-of-erasure (soft-deletes user + org cascade).
- Cookie banner shown to EU visitors only (Vercel `request.geo.country` against EEA list).
- `/privacy` and `/terms` are placeholders until Week 16.

## Deployment

GitHub → Vercel auto-deploy. Production env vars must be added in Vercel project settings (Dashboard → Settings → Environment Variables) for all three environments: Production, Preview, Development. Use `vercel env pull .env.local` to sync.

## Verified working (end of Week 1)

- `npm run build` — clean Turbopack production build, 13 routes generated, TypeScript passes.
- All routes registered:
  `/`, `/login`, `/signup`, `/onboarding`, `/dashboard`, `/inbox`,
  `/privacy`, `/terms`, `/api/gdpr/export`, `/api/gdpr/delete`, `/_not-found`.
- Middleware (proxy) registered and runs on every non-static request.
- shadcn registry: `button`, `input`, `label`, `card`, `dialog`, `dropdown-menu`,
  `avatar`, `badge`, `separator`, `sonner` (replaces `toast`), `sidebar`, `sheet`,
  plus auto-pulled `tooltip` and `skeleton`.

## Smoke-test checklist (run before declaring Week 1 done)

1. Apply `supabase/migrations/001_initial.sql` in Supabase SQL Editor.
2. Fill `.env.local` from Supabase + PostHog dashboards.
3. `npm run dev` → visit `http://localhost:3000`.
4. Sign up → confirm email if your Supabase project requires it → onboarding screen → create org → land on `/dashboard`.
5. Sign out → sign in → land on `/dashboard`.
6. Hit `/api/gdpr/export` while signed in — downloads JSON.
7. Hit `/api/gdpr/delete` (POST) — auth user removed, profile soft-deleted.

## Week 2 — Inbox UI shell (DONE)

Full 3-panel inbox built against mock data — production-ready visuals,
no real backing yet. Real data wires up in Week 4 once channels connect.

**Routes:**
- `/inbox` — empty state ("Select a conversation"); list-only on mobile
- `/inbox/[id]` — thread + contact panel; full screen on mobile with back button
- `app/(dashboard)/inbox/layout.tsx` is a **client** layout (uses `usePathname`
  to flip mobile visibility between list and detail)

**Components ([components/inbox/](components/inbox/)):**
- `conversation-list.tsx` — search (⌘K), filter tabs (All/Open/Closed/Mine/Bot)
- `conversation-item.tsx` — channel-iconed avatar, status dot, unread badge, agent avatar
- `message-thread.tsx` — top bar (assign / close / overflow), grouped bubbles
- `message-bubble.tsx` — inbound action menu (translate / copy / reply-with-quote),
  quoted-reply preview, delivery ticks (sent/delivered/read), AI-translation toggle
- `composer.tsx` — auto-grow textarea, internal-note toggle, AI Assist popover,
  Suggest Reply button (gated on bot-assigned), keyboard shortcuts
- `contact-panel.tsx` — editable name, details, tag pills, agent, notes, accordion
- `components/ui/channel-icon.tsx` — WhatsApp / Instagram / Telegram / Email / Messenger

**Keyboard shortcuts:**
- `⌘K` / `Ctrl+K` → focus conversation search
- `⌘↵` / `Ctrl+Enter` → send message
- `⌘J` / `Ctrl+J` → open AI Assist popover (composer must be non-empty)
- `⌘L` / `Ctrl+L` → Suggest Reply (composer's bot-assigned channels only)
- `Escape` → close popovers / dialogs (Radix built-in)

**AI surfaces in composer (stubbed in Week 2, real Claude in Week 7):**
- `POST /api/ai/message-assist` — `{ text, action, language?, conversation_id?, channel_id? }`
  → `{ text }`. Actions: improve / friendlier / professional / shorter / longer /
  fix_grammar / translate. Replaces composer text with rewrite, shows 6s "Undo" toast.
- `POST /api/ai/suggest-reply` — `{ conversation_id }` → `{ text }`. Replaces composer
  text with a from-scratch suggestion grounded in conversation history + bot KB.
- `POST /api/ai/translate-inbound` — `{ message_id, target_language? }` → `{ translation }`.
  Cached on `message.metadata.translation`; show-original toggle in the bubble.

**Mock data:** [lib/mock-data.ts](lib/mock-data.ts) — 10 conversations across
WhatsApp / Instagram / Telegram / Email / Messenger, in 6 languages (es/en/fr/ja/pt/de),
mix of statuses (open/closed/snoozed/bot), with attachments and inline replies.
`CURRENT_USER_AGENT_ID = "ag_1"` is the demo "Mine" filter target.

**i18n helper:** [lib/i18n/languages.ts](lib/i18n/languages.ts) — TOP_LANGUAGES
list (es/en/fr/de/pt/it/nl/ca) + `languageLabel(code)`.

**Dashboard layout change:** switched outer container from `min-h-screen` to
`h-dvh`, and `<main>` to `flex min-h-0 flex-1`. This is what lets each inbox
panel scroll independently. Other dashboard pages (e.g. `/dashboard`) need
`overflow-y-auto` on their root div if their content overflows the viewport.

**Deferred (intentionally) for later:**
- Tablet "Show details" toggle to reveal contact panel (md ≤ x < lg). Currently
  hidden below `lg`. Add when we have real density to justify it.
- Real emoji picker, file attachment upload, saved replies list — placeholders
  call `toast.message("…— Week N")` so the surface is visible.

## Week 3 — WhatsApp Cloud API integration (DONE)

Real WhatsApp messages flowing in and out via Meta Cloud API. Inbox is no
longer mock data — it reads from Supabase with realtime subscriptions.

**New migration:** [supabase/migrations/003_channels_messages.sql](supabase/migrations/003_channels_messages.sql)
- Tables: `channels`, `contacts`, `conversations`, `messages`, `webhook_log`
- All with `deleted_at` + RLS policies scoped to `org_id` via `profiles`
- Unique partial indexes on `wa_message_id` + `ig_message_id` (idempotency)
- `messages` + `conversations` added to `supabase_realtime` publication
- Active-row views: `channels_active`, `contacts_active`, `conversations_active`, `messages_active`

**Apply:** Supabase SQL Editor → paste the migration → Run.
**Pre-requisite:** Project Settings → **Vault** → ENABLE before any channel can be created (tokens stored there).

**Webhook:** [app/api/webhooks/whatsapp/route.ts](app/api/webhooks/whatsapp/route.ts)
- `GET` → handshake (`hub.verify_token` check)
- `POST` → reads RAW body, verifies `X-Hub-Signature-256` HMAC against `META_APP_SECRET`
  using `crypto.timingSafeEqual`, returns 401 on mismatch
- Idempotent inserts via `upsert(onConflict: 'wa_message_id', ignoreDuplicates: true)`
- Status updates (`sent` → `delivered` → `read`) only move forward, never regress
- Always logs payload + signature_ok to `webhook_log` (replay buffer)
- Always returns 200 within 5s (Meta retries non-200s)

**Send:** [app/api/channels/whatsapp/send/route.ts](app/api/channels/whatsapp/send/route.ts)
- Auth-gated (`supabase.auth.getUser()`)
- Loads channel + contact (RLS for conversation, admin client after)
- Decrypts token via `vaultReadSecret(channel.access_token_vault_id)`
- POSTs to `https://graph.facebook.com/v22.0/{phone_number_id}/messages`
- Saves outbound row locally; Realtime broadcasts to UI

**Vault:** [lib/supabase/vault.ts](lib/supabase/vault.ts) — `vaultCreateSecret`, `vaultReadSecret`, `vaultUpdateSecret`. Server-only.

**Settings UI:**
- [app/(dashboard)/settings/channels/page.tsx](app/(dashboard)/settings/channels/page.tsx) — list connected channels
- [app/(dashboard)/settings/channels/new/page.tsx](app/(dashboard)/settings/channels/new/page.tsx) — manual entry form:
  - Step 1: Webhook URL + Verify token displayed with copy buttons (paste into Meta dashboard)
  - Step 2: Channel name + Phone Number ID + WABA ID + Access Token (masked, reveal button)
  - On submit: token → Vault → channels row with `access_token_vault_id`
- **Embedded Signup deferred to Week 9** before client onboarding (manual entry sufficient for dev).

**Inbox wired to real data:**
- [lib/inbox/server.ts](lib/inbox/server.ts) — server-side fetchers (`getConversationsForCurrentOrg`, `getConversationDetail`, `getMessagesForConversation`)
- [lib/inbox/adapt.ts](lib/inbox/adapt.ts) — adapters from DB rows → Week-2 component shape (saves a wholesale component rewrite)
- [lib/realtime.ts](lib/realtime.ts) — `useMessages(id, initial)` per-thread + `useInboxRefresh()` for list updates
- `MessageThread` uses `useMessages`; `Composer` POSTs to `/api/channels/whatsapp/send` then waits for Realtime to render
- `ConversationList` renders an empty state with a "Connect WhatsApp" CTA when there are zero channels

**Local testing flow** (no Meta account on the laptop):
1. Apply migration 003 in Supabase SQL Editor
2. Enable Vault in Supabase project settings
3. Fill `META_APP_SECRET` in `.env.local` (Meta App Dashboard → Settings → Basic)
4. `npm run dev` — UI works empty
5. To test webhook locally: `ngrok http 3000` → paste public URL into Meta App Dashboard → WhatsApp → Configuration → Webhook (Verify Token already pushed to Vercel, copy from `.env.local`)

**Pre-existing Meta context (from your notes):**
- App ID: `4417258865176192`
- Business Portfolio: `1612917756584806`
- Use the free test phone number Meta provides until Week 9 launch

## Week 4 — Team management + chat assignment (DONE)

Migration 007 adds `conversations.snooze_until`, `profiles.availability`, an
"org members visible" RLS policy, REPLICA IDENTITY FULL on profiles for
Realtime, and an updated `handle_new_user()` that auto-links invited
profiles via `raw_user_meta_data.invited_org_id` + `invited_role`.

**New routes**
- `/settings/team` — members list (avatar + role badge + availability dot),
  pending invites, invite dialog, remove member, cancel invite
- `/settings` (existing) — now has a sub-nav at the top to switch between
  Channels and Team

**Team management** ([lib/team/](lib/team/))
- `getTeamSnapshot()` — me + members + pending invites in one call
- `getOrgMembers()` — light version for the AssignMenu
- `inviteTeamMember()` — `supabase.auth.admin.inviteUserByEmail` with our
  metadata payload. Owners + admins only. `redirectTo` is `/accept-invite`
  (NOT `/dashboard`) so the invitee sets a password before landing in the
  product — without that they'd be locked out after the magic-link session
  expires
- `removeTeamMember()` — clears `org_id` + `role`, unassigns any conversations
  they owned. Role checks: owners can't be removed, admins can't remove other
  admins, agents can't remove anyone
- `cancelInvite()` — hard-deletes the unconfirmed auth.users row so the invite
  link stops working
- `setAvailability()` — toggle online/away/offline (sidebar dot)

**Conversation actions** ([lib/inbox/actions.ts](lib/inbox/actions.ts))
- `assignConversation` + `assignConversationsBulk` — agent change with org check
- `setConversationStatus` + `setConversationsStatusBulk` — open/closed/bot
- `snoozeConversation` — presets: 1h / 4h / tomorrow 9am / next week 9am
- `deleteConversationsBulk` — soft-delete (sets deleted_at)

**Message thread top bar** ([components/inbox/](components/inbox/))
- `AssignMenu` — real org members in a dropdown, with availability dots,
  Unassigned option, "you" sorted first
- `StatusMenu` — Close / Reopen / Snooze (sub-menu) / Transfer to bot,
  conditionally rendering Close vs Reopen based on current status

**Inbox filters**
- Tabs: All / Mine / Unassigned / Bot / Closed (replaced All/Open/Closed/Mine/Bot)
- Channel filter dropdown (multi-select checkboxes, WhatsApp / IG / Telegram / Email / Messenger)
- Sort dropdown: Last activity (default) / Newest first / Oldest first
- Bulk selection: hover-revealed checkbox on each row; selection bar replaces
  the filter row when ≥1 selected, with Assign / Close / Delete (Delete behind
  a confirm dialog)

**Agent presence** ([components/app/sidebar-user.tsx](components/app/sidebar-user.tsx))
- Avatar shows availability dot (green / amber / grey)
- Clicking the user button opens a dropdown with Availability section to toggle
- Optimistic UI + revalidate on server confirm
- Visible on team members in `/settings/team` and in `AssignMenu`

**Browser notifications + tab title** ([components/inbox/notifications-watcher.tsx](components/inbox/notifications-watcher.tsx))
- Lazy permission prompt on first click anywhere
- Notifies on: conversation newly assigned to me, new inbound on conversations
  assigned to me (via Realtime + a diff against the previous snapshot)
- Tab title shows `(N) Xyra Chat` for open conversations assigned to me

**Channel token rotation** (bonus that was promised)
- [`app/(dashboard)/settings/channels/rotate-token-button.tsx`](app/(dashboard)/settings/channels/rotate-token-button.tsx)
  — paste new token → server action overwrites the Vault secret in place.
  Owners + admins only. No more SQL required when the temp token expires.

**Realtime considerations**
- Profiles added to `supabase_realtime` publication so availability changes
  propagate without a refresh

## Week 5 — Instagram DM integration (DONE)

Real Instagram DMs flowing in and out via the Meta Graph API. Same security
+ idempotency contract as WhatsApp: HMAC over the raw request body, partial
unique index on `ig_message_id`, SECURITY DEFINER wrapper for the ON CONFLICT
insert. Echoes (`is_echo`) are dropped to avoid double-storing our own outbound.

**New migrations**
- [`014_instagram_channel.sql`](supabase/migrations/014_instagram_channel.sql) —
  adds `channels.page_id`, `channels.ig_business_account_id`, `channels.metadata`
  (JSONB) plus indexes; `insert_inbound_ig_message()` SECURITY DEFINER fn that
  mirrors `insert_inbound_wa_message` from migration 006.
- [`013_drop_debug_helpers.sql`](supabase/migrations/013_drop_debug_helpers.sql)
  — drops the temporary `debug_auth_uid()` from the Week 4 RLS-recursion hunt.

**New routes**
- `app/api/webhooks/instagram/route.ts` — GET handshake (uses
  `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` — a separate verify token from WhatsApp so
  either can be rotated alone) + POST with HMAC verification using
  `META_APP_SECRET`. Handles message events, reactions (stored in
  `message.metadata.ig_reactions`), delivery + read receipts, story replies,
  and the `story_mention` / `share` / `ig_reel` attachment types. Echo
  messages are skipped.
- `app/api/channels/instagram/send/route.ts` — picks one of two send URLs:
  - IG-direct (channel.page_id IS NULL): POST
    `https://graph.instagram.com/v22.0/{ig_user_id}/messages` with the IG
    user access token from Vault.
  - Page-linked (channel.page_id IS NOT NULL): POST
    `https://graph.facebook.com/v22.0/{page_id}/messages` with the Page
    access token from Vault.
  Both paths use the same body (`recipient.id` = contact.instagram_id,
  `messaging_type: "RESPONSE"`).
- `app/api/auth/instagram/start/route.ts` + `.../callback/route.ts` — **Instagram
  Business Login** OAuth flow (the IG-direct path, NOT Facebook Login).
  Start sets a httpOnly state cookie and redirects to
  `https://www.instagram.com/oauth/authorize`. Callback verifies state,
  exchanges code at `api.instagram.com/oauth/access_token` for a short-lived
  (1h) IG user access token, upgrades to ~60-day long-lived via
  `graph.instagram.com/access_token?grant_type=ig_exchange_token`, reads
  `/me` for `id`/`username`/`profile_picture_url`, stores the token in Vault,
  and inserts a `type='instagram'` channel with `page_id=NULL` and
  `ig_business_account_id` set to the IG user id.
  - **Redirect URI to register in Meta** (Xyra Chat-IG → Instagram → API
    Setup → "Set up Instagram business login" → Redirect URL):
    `https://xyra-chat.vercel.app/api/auth/instagram/callback`
    (plus `http://localhost:3000/api/auth/instagram/callback` for local dev).
  - Was originally built against Facebook Login but pivoted to IG-direct
    because the Xyra Chat-IG Meta app is Instagram-only — `facebook.com/dialog/oauth`
    rejects the App ID with "Invalid app ID" for IG-only apps.

**Settings UI**
- [`app/(dashboard)/settings/channels/add-channel-button.tsx`](app/(dashboard)/settings/channels/add-channel-button.tsx)
  — single "Add channel" CTA → dropdown with WhatsApp / Instagram options.
- [`app/(dashboard)/settings/channels/instagram/new/`](app/(dashboard)/settings/channels/instagram/new/)
  — "Continue with Facebook" button (shown only when `META_APP_ID` is set)
  + manual entry fallback (Page ID, IG Business Account ID, Page access
  token, optional IG username). Same Vault flow as WhatsApp.
- [`app/(dashboard)/settings/channels/flash.tsx`](app/(dashboard)/settings/channels/flash.tsx)
  — toasts `?connected=instagram` / `?error=…` from the OAuth redirect, then
  strips the query params so refresh doesn't replay.

**Inbox**
- [`components/inbox/composer.tsx`](components/inbox/composer.tsx) now routes
  to `/api/channels/instagram/send` when `conversation.channel === "instagram"`
  (was hardcoded to WhatsApp send before).
- [`components/inbox/message-bubble.tsx`](components/inbox/message-bubble.tsx)
  renders the new attachment types from Instagram: `image` (already), `video`
  (HTML5 `<video controls>`), `audio` (HTML5 `<audio controls>`),
  `story_mention` (icon pill + "view" link), `share` (chip with "open" link).
  Story-reply context (`metadata.ig_story`) shows a gradient "Story reply"
  pill at the top of the bubble. IG reactions render as a small chip below.
- [`lib/inbox/adapt.ts`](lib/inbox/adapt.ts) — `attachmentTypeFromMediaType()`
  maps `messages.media_type` → the UiMessage attachment type union (which
  was extended in `lib/mock-data.ts`).

**Environment**
- New: `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (required for the webhook handshake),
  `META_APP_ID` (only required for the OAuth flow — manual entry works
  without it).
- The original Meta app and the Instagram-specific app are **separate**.
  WhatsApp webhooks HMAC against `META_APP_SECRET`; Instagram webhooks HMAC
  against `INSTAGRAM_APP_SECRET`. The IG OAuth flow uses `INSTAGRAM_APP_ID`
  + `INSTAGRAM_APP_SECRET`.

**Meta setup walkthrough** (Xyra Chat-IG app, IG-only)
1. **App Dashboard → Xyra Chat-IG → Add Products**:
   - Add **Instagram** (the messaging/posting product)
   - Add **Instagram Login** (the OAuth product — separate from "Instagram",
     and required for the Continue-with-Instagram flow to work)
   - Add **Webhooks**
2. **Instagram → API Setup**:
   - Add the IG account as an **Instagram Tester** (App Roles → Roles → tab
     "Instagram Testers" → Add). The IG account owner must accept the
     invite at `instagram.com/accounts/manage_access/` before Meta will let
     you add the account here.
   - Add the linked FB Page (only if you're using the Page-linked path —
     IG-direct doesn't need this).
3. **Instagram → API Setup → "Set up Instagram business login"**:
   - **Redirect URL**: `https://xyra-chat.vercel.app/api/auth/instagram/callback`
   - Also add the same URL under **Valid OAuth Redirect URIs**.
   - For local dev, also add `http://localhost:3000/api/auth/instagram/callback`.
4. **Webhooks → Instagram**:
   - Callback URL: `https://xyra-chat.vercel.app/api/webhooks/instagram`
   - Verify Token: value of `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to fields: `messages`, `messaging_postbacks`,
     `message_reactions`, `messaging_seen` (optional).
5. **Settings → Basic** → copy App ID into `INSTAGRAM_APP_ID`, App Secret
   into `INSTAGRAM_APP_SECRET`.
6. **App Mode**: stays in Development until App Review. In Development mode,
   only Instagram Testers can authorize — exactly what you want for now.

## Week 6 — Telegram + Email channels (DONE)

Two new inbound surfaces, both lower-friction than Meta:

**Telegram** (`api.telegram.org` bot API)
- [`014_…`](supabase/migrations/) … wait, Telegram bits live in
  [`015_telegram_email.sql`](supabase/migrations/015_telegram_email.sql):
  adds `channels.bot_username`, `messages.telegram_message_id` (composite
  `<chat_id>:<message_id>`), partial unique index for idempotency, and
  `insert_inbound_telegram_message()` SECURITY DEFINER fn.
- [`app/api/webhooks/telegram/route.ts`](app/api/webhooks/telegram/route.ts):
  POST only. Telegram identifies the channel by echoing a per-channel
  `secret_token` in the `X-Telegram-Bot-Api-Secret-Token` header (stored
  in the existing `channels.webhook_secret` column). Handles `message.text`,
  `photo`, `document`, `audio`, `voice`, `video`, `sticker`. Idempotent
  on `<chat_id>:<message_id>`. Always returns `{ ok: true }`.
- [`app/api/channels/telegram/send/route.ts`](app/api/channels/telegram/send/route.ts):
  POSTs to `api.telegram.org/bot{token}/sendMessage` or `/sendPhoto`. Token
  decrypted from Vault per request.
- [`app/(dashboard)/settings/channels/telegram/new/`](app/(dashboard)/settings/channels/telegram/new/):
  Bot Token field. On submit: `getMe` to validate + capture bot username,
  generate a random `secret_token`, call `setWebhook` to register our
  endpoint, stash the raw token in Vault. Done.

**Email** (Resend Inbound + outbound)
- [`app/api/webhooks/email/route.ts`](app/api/webhooks/email/route.ts):
  Resend uses Svix for webhook delivery. Verify via `svix-id` + `svix-timestamp` +
  `svix-signature` headers, HMAC-SHA256 against `RESEND_WEBHOOK_SECRET`
  (strip `whsec_` prefix, base64-decode, then sign
  `${svixId}.${svixTs}.${rawBody}`). Threading: resolve which conversation
  an inbound belongs to via `In-Reply-To` / `References` headers — both
  reference Message-Ids of emails we stored earlier in
  `messages.email_message_id`. Falls back to "open conversation with this
  contact" then "create new."
- [`app/api/channels/email/send/route.ts`](app/api/channels/email/send/route.ts):
  Uses the Resend SDK (`resend` npm package). When `repliedToMessageId` is
  set, copies the inbound subject (prefixes `Re:` if missing) and emits
  `In-Reply-To` + `References` headers so the customer's mail client
  threads it correctly.
- [`app/(dashboard)/settings/channels/email/new/`](app/(dashboard)/settings/channels/email/new/):
  Form lets the user pick an inbox prefix (validated `a-z0-9._-`), shows
  the full address `<prefix>@<INBOUND_EMAIL_DOMAIN>` live with a copy
  button, optional From-name override. After save, surfaces "use directly
  OR forward to it" guidance.

**Shared plumbing**
- `lib/db-types.ts` grew `ChannelRow.bot_username`, `inbox_email`, and a
  bigger `ChannelMetadata` (bot_id, from_name). `MessageMetadata` gets an
  `email` sub-record with subject + addresses + html_body + threading
  headers; `MessageRow` gets `telegram_message_id` + `email_message_id`.
- [`components/inbox/composer.tsx`](components/inbox/composer.tsx) now
  routes to the matching `/api/channels/{provider}/send` for whatsapp / 
  instagram / telegram / email.
- [`components/inbox/message-bubble.tsx`](components/inbox/message-bubble.tsx)
  renders an email's subject as a bold line above the body when
  `metadata.email.subject` is set.
- [Add-channel dropdown](app/(dashboard)/settings/channels/add-channel-button.tsx)
  now offers four: WhatsApp / Instagram / Telegram / Email.

**Environment** (additions)
- `RESEND_API_KEY` — verifies inbound + sends outbound.
- `RESEND_WEBHOOK_SECRET` — `whsec_<base64>` from Resend → Webhooks.
- `INBOUND_EMAIL_DOMAIN` — e.g. `mail.xyrachat.com`. Must have MX records
  pointing at Resend.
- `EMAIL_FROM_ADDRESS` — fallback From: when a channel has no inbox_email.

**Out-of-the-box advantage**: Telegram has zero dev-mode restrictions, so
once a bot is connected via BotFather and webhooks register, real DMs
flow immediately. Use this as the channel that proves the end-to-end
inbox pipeline while Instagram waits in App Review.

## Week 7 — AI Chatbot Engine + RAG (DONE)

The /api/ai/* stubs from Week 2 are now real Claude calls, and webhook
handlers run an automated bot reply gate on every inbound.

**Schema** — [`016_bots_rag.sql`](supabase/migrations/016_bots_rag.sql)
- `bots` — per-org AI assistant config (objective, tone, personality,
  business_hours, knowledge_threshold, behavior_rules, handoff_triggers,
  greeting_message, off_hours_message). RLS via `current_user_org_id()`
  helper from migration 010.
- `bot_sources` — uploaded text / urls / documents, status field for
  embedding pipeline progress.
- `bot_embeddings` — chunked text + `vector(1536)` for OpenAI
  text-embedding-3-small. ivfflat index on cosine similarity.
- `bot_assignments` — channel→bot, UNIQUE on channel_id (MVP one bot per
  channel).
- `bot_outcomes` — KPI rows for the Week 8 analytics page
  (lead_captured, link_clicked, qualified, handoff,
  fallback_no_knowledge, etc.).
- `match_embeddings()` SECURITY DEFINER RPC for vector search.
- `channels.auto_translate_inbound` + `auto_translate_target_lang` —
  per-channel zero-click translation toggle.
- `contacts.detected_language` + `detected_language_confidence` —
  caches franc-detected language to skip detection on stable customers.

**AI library** ([`lib/ai/`](lib/ai/))
- `clients.ts` — lazy `getAnthropic()` / `getOpenAI()` singletons,
  `MODELS` enum (generation: `claude-sonnet-4-6`, rewrite:
  `claude-haiku-4-5-20251001`, embedding: `text-embedding-3-small`,
  transcription: `whisper-1`).
- `embeddings.ts` — `chunkText()` sentence-aware splitter with 500-token
  chunks + 50-token overlap (chars-per-token approximation, no
  tokenizer dep), `embedChunks()` batches OpenAI embed calls and
  updates `bot_sources.embedding_status`, `ingestText()` convenience.
- `retrieval.ts` — `retrieveContext(query, botId)` returns chunks +
  maxSimilarity for the caller's threshold check.
- `chatbot.ts` — `generateBotResponse()` with **Anthropic prompt
  caching**: system prompt and RAG chunks each get
  `cache_control: { type: "ephemeral" }` (5-min TTL). Reports
  `cache_read_input_tokens` / `cache_creation_input_tokens` per call
  for cost visibility. Builds objective-specific guidance for all 7
  objectives (support / lead_generation / website_traffic / sales /
  booking / qualification / custom). Parses `[HANDOFF_REQUESTED]` from
  the model output AND keyword triggers from `bot.handoff_triggers`.
- `language-detect.ts` — `detectLanguage()` wraps franc with ISO 639-3
  → 639-1 normalisation + a length-based confidence heuristic.
- `bot-gate.ts` — the central gate runner called from every webhook.
  Six sequential gates:
  1. Bot assigned to this channel?
  2. Auto-pause: did a human agent reply in the last 6h? Stay quiet.
  3. Conversation status: must be 'bot' or 'open' AND unassigned.
  4. Business hours: respects per-bot timezone + day windows via Intl
     (no tz dep). Off-hours either sends `off_hours_message` or skips
     silently.
  5. WhatsApp 24h customer-service window (WA channels only).
  6. Voice transcription (Whisper) — currently logged-and-skipped
     placeholder; flip to active when ready.
  Gate 7 (token budget) deferred — needs a `subscriptions` table
  which doesn't exist yet. When it does, hook in here. Greeting
  message sent before the first generated reply when
  `bot.greeting_message` is set AND it's the first turn.
  All outcome rows logged to `bot_outcomes` for analytics.
- `auto-translate.ts` — `maybeAutoTranslate()` runs after the inbound
  is stored, before the bot gate. Detects language (cached on contact),
  Haiku-translates to channel's target, writes to
  `messages.metadata.translation_cache[target]` AND
  `messages.metadata.auto_translation = { source, target, text }`.

**Endpoints — real Claude wired in**
- `/api/ai/message-assist` — per-action system prompts, optional prior
  conversation context (last 5 messages), per-channel max-length clamp
  with sentence-boundary truncation, Haiku by default.
- `/api/ai/suggest-reply` — resolves the assigned bot via
  `bot_assignments`, runs the same RAG + Claude pipeline as the live
  bot but returns to the agent. Surfaces `sources_used` so the UI can
  show provenance.
- `/api/ai/translate-inbound` — Haiku translation with per-target cache
  in `messages.metadata.translation_cache`. Skips the API call when the
  detected source matches the target.

**Webhook integration**
- WhatsApp + Instagram + Telegram webhook handlers now call
  `maybeAutoTranslate()` + `runBotGate()` after the idempotent insert
  + last_message_at bump. Both run sequentially (not Promise.all) so
  the bot reply ordering is deterministic and we don't double-charge
  on auto-translate + greeting.
- Outbound bot replies write directly to provider APIs via in-file
  helpers in `bot-gate.ts` (Telegram: api.telegram.org/sendMessage;
  WA: graph.facebook.com/{phone_number_id}/messages; IG: branches IG-
  direct vs Page-linked the same as the agent send endpoint). Stored
  with `sender_type='bot'` + full usage metadata
  (`{ model, input_tokens, output_tokens, cache_read_input_tokens,
    cache_creation_input_tokens, sources_used, max_similarity }`).

**What's NOT shipped this week (deferred)**
- Voice transcription (Whisper) — webhook gate logs + skips audio
  inbound. Hook up when needed.
- ~~Token budget gate~~ — landed in migration 017 (see below).
- Bot CRUD UI — Week 8 explicitly owns the training-screen surfaces.
  For now, bots and sources can be created via SQL (or via Week 8 UI
  when it lands).
- Conversation language auto-detect for the agent's UI (cached on
  `contacts.detected_language` but not yet surfaced in the
  inbox/sidebar).

## Week 7.5 — Per-org AI token budget (Gate 7, DONE)

Closes the gap that Week 7 deferred: every AI call now charges against
the org's monthly budget, and the bot stops responding (gracefully,
logged) when the budget runs out.

**Schema** — [`017_subscriptions.sql`](supabase/migrations/017_subscriptions.sql)
- `subscriptions(org_id UNIQUE, plan, monthly_ai_tokens_limit BIGINT,
  tokens_used_this_month BIGINT, billing_cycle_start)` — one per org.
- Trigger `create_subscription_on_org_insert` auto-creates a free row
  (50,000 tokens/month) for every new org. Backfilled for existing orgs.
- `consume_ai_tokens(p_org_id, p_amount)` SECURITY DEFINER RPC: atomic
  monthly rollover (every 30 days from billing_cycle_start) +
  check + increment. Returns the post-mutation row so callers can
  surface tokens-remaining in error responses. `p_amount=0` lets
  callers do a pre-flight check without spending.
- RLS: agents in the org can SELECT their subscription (used by the
  Week 8+ usage indicator); all writes go through the RPC under
  service_role.

**Code**
- [`lib/billing/plans.ts`](lib/billing/plans.ts) — five tiers in code
  (free / starter / pro / scale / custom). Pricing is illustrative
  pending Stripe wiring at launch.
- [`lib/billing/usage.ts`](lib/billing/usage.ts) — `checkAiQuota(orgId)`
  (pre-flight, no spend) and `consumeAiTokens(orgId, amount)` (atomic
  check + spend). Both return rich state — plan, tokens_used,
  tokens_remaining, percent_used — so the UI can show good upgrade
  prompts. Fails OPEN on RPC error (better to over-serve once than
  break a customer on a billing glitch).
- All AI call sites gated:
  - Bot gate (Gate 7) pre-flight + post-call consume.
  - `/api/ai/message-assist`, `/api/ai/suggest-reply`,
    `/api/ai/translate-inbound` return HTTP 402 + `AI_QUOTA_EXCEEDED`
    body when exhausted.
  - `lib/ai/auto-translate.ts` skips silently when exhausted (avoids
    spamming the UI on every inbound).
  - `lib/ai/embeddings.ts` refuses + marks the source `failed` with
    error `AI_QUOTA_EXCEEDED` so the user gets visible feedback rather
    than a stuck "running" indicator.

**Free plan defaults**: 50,000 tokens/month (~250 bot replies +
~500,000 translated messages). When a client outgrows it, the UI
should surface the upgrade path (Week 8+).

## Week 8 — Bot training UI (DONE)

End-to-end loop for creating + training + assigning bots through the UI
instead of SQL.

**New routes**
- `/bots` — grid of bot cards (objective + source count + active channel
  count + status badge).
- `/bots/new` — two-step wizard:
  - Step 1: pick objective (7 cards) + bot name. Picking an objective
    seeds defaults (instructions, greeting, handoff triggers) only when
    fields are empty so you don't lose typed work.
  - Step 2: instructions, greeting, tone (5 cards with example phrases),
    language, emoji usage, response length, knowledge_threshold slider,
    handoff triggers (pill add/remove).
- `/bots/[id]` — five tabs:
  - **Overview**: count tiles (sources, active channels, handoffs,
    resolved %), plus an objective-specific KPI card (leads captured /
    link clicks / booking clicks / qualified leads / knowledge gaps).
  - **Knowledge**: add text source (paste + embed), add URL (cheerio
    scrape + embed), source list with embedding_status badges + delete +
    a "Refresh status" button (true Realtime subscription deferred —
    refresh is enough for now). File upload deferred with a "soon" pill.
  - **Test**: ephemeral chat against `testBot()` server action, NOT
    written to the inbox or `bot_outcomes`. Shows `sources_used` chips
    + similarity score (highlighted red below threshold) so you can
    tune `knowledge_threshold` empirically. AI tokens still count
    against the org budget.
  - **Assign**: per-channel toggle. Flipping a channel ON automatically
    replaces any previous bot on that channel (UNIQUE(channel_id)
    constraint).
  - **Settings**: full edit form for everything in the wizard + behavior
    rules (never_say / always_do textareas) + handoff message +
    business-hours active toggle + off-hours message. Delete bot button
    soft-deletes + unassigns + redirects.
- `/settings/billing` — Plan & Usage card with progress bar, days-to-reset,
  side-by-side plan grid (free / starter / pro / scale). Stripe checkout
  deferred to launch prep.

**Code**
- [`lib/bots/actions.ts`](lib/bots/actions.ts) — `createBot()`,
  `updateBot()` (whitelisted columns to stop client-side org_id
  injection), soft `deleteBot()`, `setChannelAssignment()`,
  `addTextSource()` / `addUrlSource()` / `deleteSource()`, and
  `testBot()` (ephemeral run-through with quota gate).
- [`lib/ai/scraper.ts`](lib/ai/scraper.ts) — cheerio-based URL fetch:
  10s timeout, 1MB body cap, strips script/style/nav/footer, prefers
  `<main>`/`<article>`, walks h1-h4/p/li/blockquote in document order,
  falls back to div-text for SPA-heavy pages. Returns `{title, text,
  description}` — title goes into the source row, text into the embed
  pipeline.

**Deferred (with markers)**
- File upload for documents (PDF/DOCX) — the form shows a "soon"
  disabled button. Once we wire `pdf-parse` + `mammoth` + Supabase
  Storage, the same `process-source` path handles them.
- Realtime embedding status — currently polled via a "Refresh status"
  button. The schema already supports Supabase Realtime subscriptions;
  hooking it in is a small follow-up.
- Live preview panel in the wizard (calls a `/api/bots/preview-greeting`
  endpoint with Haiku) — defer until the static defaults prove not
  expressive enough.
- "Suggested for this goal" panel in Settings with per-section Apply
  buttons — deferred. For now the wizard seeds defaults at creation
  only.
- Per-day business-hours UI editor — the active toggle works, day/
  window JSON edit still requires SQL.
- Voice note test ("Send a voice note" file picker in Test tab) —
  deferred with Whisper transcription.

## Week 9 — WhatsApp Templates + Broadcasts + Opt-out (DONE)

End-to-end loop for submitting pre-approved WhatsApp templates to Meta
and using them in audience-targeted broadcast campaigns, with STOP/START
opt-out handling baked into inbound flow.

**Schema** — [`018_templates_broadcasts.sql`](supabase/migrations/018_templates_broadcasts.sql)
- `wa_templates` — local mirror of Meta templates. Stores `name`,
  `language`, `category` (MARKETING / UTILITY / AUTHENTICATION), `components`
  (Meta's JSONB shape verbatim), `meta_template_id`, `meta_status`
  (PENDING / APPROVED / REJECTED / DISABLED / PAUSED / IN_APPEAL /
  LIMIT_EXCEEDED), `meta_rejection_reason`, `example_values`. Unique
  `(channel_id, name, language)` while not deleted.
- `broadcasts` — campaign rows. Status: draft / scheduled / sending /
  done / failed / cancelled. Tracks `variable_mapping` (per-{{N}} mapping
  to contact_name | fixed value), `audience_filter` (all / tags /
  lastActiveAfter), live counts (`total_count`, `sent_count`,
  `failed_count`, `skipped_opt_out_count`), and timing
  (`started_at`, `finished_at`).
- `broadcast_recipients` — one row per (broadcast, contact) with
  send-time `wa_message_id`, `error_message`, `delivery_status`. Unique
  `(broadcast_id, contact_id)` so accidental reruns can't double-send.
- `contacts` gains `opted_out` / `opted_out_at` / `opt_out_reason`.
- `opt_out_log` — audit trail of opt-out + opt-in events with keyword,
  message content, channel type. Read-only via RLS; service-role writes.
- `touch_updated_at()` trigger on `wa_templates` so the table reflects
  the last Meta sync timestamp.

**Templates library** ([`lib/templates/`](lib/templates/))
- `types.ts` — Meta component shapes (HEADER text + IMAGE/VIDEO/DOCUMENT,
  BODY, FOOTER, BUTTONS: QUICK_REPLY / URL / PHONE_NUMBER) +
  `countVariables` / `applyVariables` / `isValidTemplateName` /
  `normalizeTemplateName` helpers.
- `actions.ts` — `createTemplate()` submits to Meta + writes the local
  row on success (no row on Meta error so the user can fix + retry).
  Auto-injects `example.body_text` / `example.header_text` arrays into the
  Meta payload from the UI's example values so reviews pass.
  `syncTemplates()` loops every WA channel in the org, pulls Meta's
  `message_templates` list, upserts `meta_status` / `meta_template_id` /
  `meta_rejection_reason` locally. `deleteTemplate()` soft-deletes (Meta
  keeps its copy for reporting).

**Broadcasts library** ([`lib/broadcasts/`](lib/broadcasts/))
- `actions.ts` — `previewAudience()` returns `{total, eligible,
  skipped_no_phone, skipped_opt_out}` for the wizard's live count.
  `createBroadcast()` validates template approval state +
  channel match, snapshots audience size at draft time. `deleteBroadcast()`
  refuses to delete a `sending` row. `reSubscribeContact()` flips
  `opted_out → false` + logs to `opt_out_log`. `fetchAudience()` is the
  shared helper used by preview, create, and the send endpoint — applies
  tag overlap + `lastActiveAfter` cutoff via the conversations table.

**Opt-out detection** ([`lib/contacts/opt-out.ts`](lib/contacts/opt-out.ts))
- `classifyOptOut()` matches multilingual STOP / START keywords on
  trimmed, stripped-punctuation, lowercased equals — "if you stop the
  car" doesn't unsubscribe; "STOP" does.
- `applyOptOutAction()` updates `contacts.opted_out`, inserts an
  `opt_out_log` row, returns the auto-confirmation copy. WA webhook
  reads it and sends the confirmation via the WA Graph API and *skips*
  the bot gate so a chatbot reply doesn't pile on the unsubscribe ack.

**Routes**
- `/templates` — list with status badges (Approved / Pending review /
  Rejected with reason / etc), Sync-from-Meta button, body preview, and
  empty state pointing at WA channel setup when no WA channel exists.
- `/templates/new` — two-column builder. Left: setup (channel + name
  with auto-normalize to `lowercase_snake_case` + category cards +
  language) → Header (None / Text / Media) → Body (with variable
  insertion + `{{N}}` counter + example-value inputs) → Footer →
  Buttons (max 3, Quick reply / URL / Phone). Right: live WhatsApp-bubble
  preview with example values substituted. Submits to Meta then redirects.
- `/broadcasts` — list with progress bars (sent/failed/total %), status
  badges, "Launch now" CTA inline for draft rows. Blocks on missing WA
  channel or zero approved templates with a guided CTA.
- `/broadcasts/new` — three-step wizard:
  - Step 1 (Setup): channel → template (filtered to approved, on this
    channel) → sample render preview → per-variable mapping rows
    (contact_name | fixed value).
  - Step 2 (Audience): All contacts | By tag (multi-select from
    workspace tags) + optional "Active since" date. Live preview card
    shows `X will receive · Y matched · Z opted out · A no phone` and
    warns above 1,000 recipients.
  - Step 3 (Schedule): Send now (saves as draft → Launch now button) |
    Schedule for later (datetime-local input).

**Send endpoints**
- `app/api/broadcasts/send/route.ts` — user-auth manual launch. Re-runs
  `fetchAudience` at send time (opt-outs may have changed since draft),
  pre-creates `broadcast_recipients` rows via upsert + ON CONFLICT IGNORE,
  POSTs to Meta with a 15 ms gap (~67/sec, well under Meta's 80/sec WA
  rate limit), persists progress every 50 sends, then marks `done` with
  finals. Mirrors every successful send into a conversation + outbound
  message so it shows up in the inbox. Refuses audiences >15 k for a
  single invocation.
- `app/api/cron/broadcasts/route.ts` — Vercel Cron / pg_cron / VPS
  trigger every 5 min (`vercel.json` configured). Picks up scheduled
  broadcasts due now, pessimistically flips status to `sending` to
  prevent double-fire, then dispatches to
  `app/api/broadcasts/send-internal/route.ts` (twin of `/send` but
  CRON_SECRET-auth instead of user-auth — duplicated rather than
  refactored so the two auth surfaces are reviewable independently).

**Webhook integration**
- WA webhook (`app/api/webhooks/whatsapp/route.ts`) now runs the opt-out
  classifier on every inbound text, applies the action, sends the auto
  confirmation via the WA Graph API, and skips the bot gate when the
  contact just unsubscribed.

**Environment** (new)
- `CRON_SECRET` — long-lived bearer the Vercel Cron job (and any external
  trigger) sends in the `Authorization` header to `/api/cron/broadcasts`
  and `/api/broadcasts/send-internal`. Generate one and set it in Vercel
  Project Settings + `.env.local`.

**Sidebar** — added `Templates` between `Bots` and `Broadcasts` in
[components/app/sidebar-nav.tsx](components/app/sidebar-nav.tsx).

**Deferred (intentionally) for later**
- Template media-sample upload (IMAGE/VIDEO/DOCUMENT headers): the UI
  collects the format but doesn't upload a `header_handle` yet. Meta
  may auto-approve IMAGE without one but commonly rejects VIDEO/DOC —
  add the upload UI when the first rejection lands.
- Template editing — Meta doesn't support editing pending templates;
  for approved ones you can edit body/category. Today the UI does
  delete + recreate; an edit form is straightforward when wanted.
- Button parameters (dynamic URL, copy-code) — buttons render in
  preview but the send-time `buttons` parameter array isn't built.
  Add when a template needs them.
- Cancel a scheduled broadcast pre-launch + cancel mid-send — schema
  has `cancelled` status; need the UI + a check in the send loop.
- Per-day per-channel scheduling for broadcasts (e.g. "send Mon-Fri
  9 am only").
- Contact list page (`/contacts`) still placeholder — Week 12 territory.

## Week 10 — Trigger-based automations (DONE)

ManyChat-style automations: a channel-scoped trigger (IG DM keyword, IG
comment keyword, IG story mention, WA keyword, conversation_opened,
external webhook) fires an ordered list of actions (send DM, tag contact,
assign agent, POST webhook). Lives alongside the Week 7 bot — they're
complementary: the bot handles open-ended chat, automations handle
deterministic flows.

**Schema** — [`021_automations.sql`](supabase/migrations/021_automations.sql)
- `automations` — per-channel row with `trigger_type`, `trigger_config`
  (keywords + match mode + optional post_id), `actions` (JSONB array
  processed in order). Counters maintained by the executor:
  `run_count`, `success_count`, `failure_count`, `last_triggered_at`.
- `automation_logs` — last-N audit rows for the analytics panel. Per-step
  outcome stored in `steps` JSONB so partial successes are introspectable.
- `automation_fires` — service-role-only dedupe table for one-shot
  triggers (`ig_new_follower`, `conversation_opened`). Primary key
  `(automation_id, contact_id)` so the second fire is a constraint
  violation we swallow silently.

**Library** ([`lib/automations/`](lib/automations/))
- `types.ts` — pure types + `renderTemplate()` (`{{contact_name}}`,
  `{{first_name}}`, `{{contact_phone}}`, `{{contact_email}}`,
  `{{username}}`, plus any extras) + `matchesKeywords()`
  (word-boundary or whole-message match) + `allowedTriggersForChannel()`.
  Pure module — safe to import from client + server.
- `executor.ts` — `executeAutomation()` runs the actions array against
  a contact + channel. Inline provider sends (WA / IG IG-direct +
  Page-linked / Telegram). Tags written with dedupe. `assign_agent`
  flips `conversations.assigned_to`. Webhook action POSTs JSON +
  optional bearer. Records per-step outcomes + bumps counters.
  Tenant guard: refuses cross-org execution outright. Outbound goes
  in with `sender_type='bot'` and `metadata.automation=true` so the
  inbox shows it as automation, not agent.
- `triggers.ts` — `dispatchTrigger()` is the entry point called from
  webhooks. Loads matching active automations, filters by trigger_config,
  enforces one-shot dedupe via `automation_fires`, fires the executor
  fire-and-forget so a slow Meta call doesn't block the webhook 200.
- `actions.ts` — `createAutomation()` / `updateAutomation()` /
  `deleteAutomation()` / `setAutomationActive()`. Per-channel trigger
  validation (no IG triggers on a WA channel etc). Whitelisted update
  columns. RBAC: owners + admins + supervisors can edit; only owners +
  admins can delete.

**Routes**
- `/automations` — list with on/off badge, run counts, success/failure
  ratio. Empty state when no channels exist.
- `/automations/new` — single-page builder: Setup (name + channel) →
  Trigger (card grid filtered to channel-allowed triggers, with
  keyword + match-mode inputs when relevant + optional IG post_id
  pin) → Actions (add Send DM / Tag contact / Assign agent / Webhook
  POST; reorder with arrows, remove with trash). The `ig_new_follower`
  card is shown but disabled with an explanation — Meta doesn't push
  follower events; needs a polling worker that lands later.
- `/automations/[id]` — detail. Counters tiles + last 20 runs
  (per-row contact + status badge) + the same builder pre-filled for
  edits. Active toggle in the header. Delete button (owners/admins).

**Webhook integration**
- IG webhook now handles `entry.changes` for `comments` field —
  resolves the commenter to a contact (auto-creating if new) and
  fires `ig_comment_keyword` triggers. Inbound DMs fire
  `ig_dm_keyword` triggers. Story-mention attachments fire
  `ig_story_mention`. All dispatched after the existing bot gate so
  the gate's auto-pause / tenant-guard runs first.
- WA webhook fires `wa_keyword` on every inbound text (not on STOP
  unsubscribes — opt-out path short-circuits before reaching the
  dispatcher) + `conversation_opened` once per (automation, contact).
- Telegram webhook fires `conversation_opened` once per (automation,
  contact). Keyword triggers are WA/IG only for MVP.

**Deferred (intentionally) for later**
- **Visual flow canvas** — current builder is a linear list. Drag-drop
  branching can come when customers ask.
- **Wait / delay actions** — the executor logs+skips them today. Needs
  a `delayed_actions` table + a runner (pg_cron when we're ready). UI
  doesn't surface the action.
- **Sequences** — `add_to_sequence` is a placeholder action that logs
  failed with `sequences not built yet`.
- **Conditional branching** — single linear flow only.
- **IG new-follower trigger** — Meta doesn't push these. Needs a
  poller (Week 11+ infra). The trigger type is in the schema for
  forward-compat; the UI shows it disabled.
- **Tag editor in inbox** — automations write tags; surfacing them
  for manual edit is queued (placeholder in StatusMenu).
- **External-webhook trigger UI** — schema + `webhook` trigger type
  ready; the inbound trigger endpoint
  (`/api/automations/<id>/trigger`) lands with Week 11's webhook layer.

## Week 11 — Public REST API + Outbound Webhooks (Session 1 DONE)

Foundation shipped today. Make/Zapier/n8n connector packages + OpenAPI
auto-gen + docs site land in Sessions 2-3 (see pre-launch checklist).

**Schema** — [`023_public_api.sql`](supabase/migrations/023_public_api.sql)
- `api_keys` — bearer credentials with scopes + expiry + revocation +
  last_used tracking. Stored as SHA-256(plaintext + APP_PEPPER); the
  plaintext is shown once at creation and never persisted.
- `webhook_endpoints` — per-org outbound URLs. Includes a `source`
  column (manual / make / zapier / n8n / api) for the dashboard label,
  consecutive_failures counter for health badge, GIN index on `events`
  for fast per-event lookup.
- `webhook_deliveries` — audit + retry state. Status: pending /
  succeeded / failed / retrying / exhausted. event_id is stable across
  retries so consumers can dedupe.
- `api_request_log` — per-request audit (no bodies; PII-clean).
- `api_idempotency_keys` — caches POST responses for 24h, keyed by
  `${api_key_id}:${client_supplied_key}`.

**Library** ([`lib/api/`](lib/api/))
- `keys.ts` — `generateApiKey()` (`xyra_live_<24 url-safe chars>`) +
  `hashApiKey()` (SHA-256 + APP_PEPPER).
- `auth.ts` — `requireApiKey(req, ...scopes)`. Constant-time hash
  compare. Best-effort last_used_at update fire-and-forget. Logs
  request via `logApiRequest()` (no bodies).
- `scopes.ts` — vocabulary (`contacts:read/write`, `messages:write`,
  `webhooks:read/write`, `admin`, etc). `admin` is the meta-grants-all.
- `errors.ts` — Stripe-like canonical shape:
  `{ error: { type, code, message, param? } }` with HTTP statuses
  400/401/403/404/409/422/429/500.
- `pagination.ts` — cursor = base64url(JSON({id, created_at})). Sort
  always (created_at DESC, id DESC). Limit clamped to 200.
- `idempotency.ts` — get/store cached responses for Idempotency-Key.
- `ssrf.ts` — `assertSafeOutboundUrl()`. Blocks RFC1918 / loopback /
  link-local / cloud metadata / CGNAT / IPv6 ULA + non-http(s)
  schemes + credentials-in-URL. Resolves DNS at validation time AND
  before each delivery (rebinding defense).
- `events.ts` — canonical event-type strings. Keep stable.
- `emit.ts` — `emit({ type, orgId, data })`. Loads matching active
  endpoints, applies optional filters, HMAC-signs the payload via the
  Stripe scheme `t=<ts>,v1=<hmac>` where `hmac=HMAC-SHA256(secret,
  "${ts}.${rawBody}")`, POSTs with 10s timeout. 2xx → succeeded; 410
  → exhausted + deactivate endpoint; other 4xx → failed (no retry);
  5xx/timeout → retrying + next_retry_at=+30s. Bumps consecutive_failures.
- `key-actions.ts` + `webhook-actions.ts` — server actions for the
  dashboard UI (create/revoke/delete keys; create/update/delete
  endpoints + replay deliveries).

**Routes**
- `GET /api/v1/me` — whoami (returns key id, org id, name, scopes).
- `GET /api/v1/contacts` — list with cursor pagination.
- `POST /api/v1/contacts` — create or upsert by phone/email/instagram_id/telegram_id.
  Honors `Idempotency-Key` header. Emits `contact.created` / `contact.updated`.
- `GET /api/v1/conversations` — list with cursor pagination + status/channel filter.
- `POST /api/v1/messages` — send text/template/image via the conversation's
  channel. Honors WA 24h window (422 outside + type=text). Honors
  Idempotency-Key. Emits `message.sent`. Provider routing: WA + IG
  (IG-direct OR Page-linked) + Telegram.
- `POST /api/v1/webhooks/subscribe` — Make/Zapier/n8n connectors call
  this to register an outbound endpoint. Returns the secret ONCE.
  `X-Xyra-Source` header tags the row (`manual`/`make`/`zapier`/`n8n`/`api`).
- `DELETE /api/v1/webhooks/:id` — connector tear-down on Zap deactivation.

**Webhook integration**
- WA + IG + Telegram inbound handlers now call `emit({ type:
  'message.received', ... })` after the message lands. Future events
  (`conversation.opened`, `bot.handoff`, `bot.lead_captured`,
  `broadcast.completed`, etc.) wire in during Session 2.

**Dashboard** — `/settings/api` (Owners + Admins only)
- API keys card: name, prefix, scopes, last-used, revoke/delete.
  New-key modal collects scopes (grouped by resource), optional
  expiry (30/90/365/never), shows the plaintext ONCE in a copy-card
  with a red banner.
- Webhook endpoints card: status badge (Healthy / Retrying / Failing /
  Paused), source badge (manual / make / zapier / n8n / api),
  pause/resume, delete. New-endpoint modal collects URL + name +
  event list, SSRF-validates the URL, returns the signing secret ONCE.
- Quick-test snippet at the bottom of the page (curl /me).

**Session 2 — DONE (2026-05-28)**
- Single-resource endpoints + actions: `GET/PATCH/DELETE
  /api/v1/contacts/:id`, `POST /:id/tags`, `DELETE /:id/tags/:tag`,
  `POST /:id/opt_out`, `GET /api/v1/conversations/:id`, `PATCH
  /api/v1/conversations/:id`, `POST /:id/close`, `POST /:id/assign`,
  `POST /:id/transfer_to_bot`, `GET /:id/messages`.
- Read endpoints: `GET /api/v1/channels`, `GET /:id`,
  `GET /api/v1/templates`, `GET /api/v1/bots`, `GET /api/v1/outcomes`,
  `GET /api/v1/webhooks`, `GET /api/v1/webhooks/:id/deliveries`.
- Mutating endpoints: `POST /api/v1/broadcasts`, `POST /:id/launch`,
  `POST /api/v1/automations/:id/run`, `POST /api/v1/bots/:id/handoff`.
- Plan gate on `createApiKey`: Free → no API access; Starter →
  read-only keys only; Pro+ → full read+write. Five tiers now carry
  `apiAccess`, `apiRequestsPerMin`, `webhookDeliveriesPerMonth` defaults
  in [lib/billing/plans.ts](lib/billing/plans.ts).
- Rate-limit headers (`X-RateLimit-Limit/Remaining/Reset`) stub on every
  response via the shared `apiHandler()` wrapper — real per-key
  enforcement via Upstash lands in the debug phase.
- **OpenAPI 3.1 spec** — hand-maintained in
  [lib/api/openapi.ts](lib/api/openapi.ts), served at
  `GET /api/v1/openapi.json` (no auth, 5-min cache). Connector
  packages introspect this.
- **Swagger UI** at `/docs/api` (in-dashboard, behind login). Loads
  swagger-ui-dist from CDN — no runtime dep.
- **Docs pages** at `/docs/api/{quickstart,auth,idempotency,errors,webhooks}`
  with curl + JS + Python + Go HMAC verification code samples.
- **Webhook retry worker** — `POST/GET /api/internal/webhook-retry`
  (CRON_SECRET-authed) drains `webhook_deliveries` where status
  in (pending,retrying), HMAC-signs + SSRF re-checks each delivery,
  applies exponential backoff `30s → 1m → 5m → 30m → 2h → 6h → 12h
  → 24h` (8 attempts max → exhausted). Migration 024 schedules
  `process_webhook_retries()` via pg_cron every minute; operator must
  ENABLE the `http` extension in Supabase Dashboard → Database →
  Extensions AND set Postgres config:
  ```
  SELECT set_config('xyra.webhook_retry_url',
                    'https://xyra-chat.vercel.app/api/internal/webhook-retry',
                    false);
  SELECT set_config('xyra.cron_secret', '<your CRON_SECRET>', false);
  ```
- Shared infrastructure: `lib/api/handler.ts` (`apiHandler()` wrapper
  for consistent auth + timing + rate-limit headers + error catching);
  `lib/api/shapes.ts` (canonical JSON shapes per resource).

**Session 3 — DONE (2026-05-28)**
- **`/integrations` dashboard page** — hero, three connector tiles
  (Make / Zapier / n8n), 6 recipe cards, build-your-own REST API CTA.
  Sidebar gains "Integrations" between Automations and Settings.
- **Make.com Custom App scaffold** — [`integrations/make/`](integrations/make/).
  `app.json` manifest, `connection/` (api-key + /me test), 4 triggers
  (instant via REST Hook) + 6 actions + 1 search. Each subscribes via
  `POST /api/v1/webhooks/subscribe` with `X-Xyra-Source: make`.
- **Zapier Platform CLI app** — [`integrations/zapier/`](integrations/zapier/).
  `index.js`, `authentication.js`, `lib/webhook.js` (shared subscribe/
  unsubscribe), 4 REST Hook triggers + 6 creates + 1 search. Global
  beforeRequest/afterResponse middleware for auth + error mapping.
- **n8n community node** — [`integrations/n8n/`](integrations/n8n/).
  npm package `@xyrachat/n8n-nodes-xyrachat`. Standalone TypeScript
  build (excluded from Next.js TS project). Single Resource/Operation
  action node covering every documented endpoint + dedicated REST-Hook
  Trigger node.
- **Cookbook** at [`/docs/integrations/cookbook`](app/(dashboard)/docs/integrations/cookbook/page.tsx)
  with 6 recipes (WA lead → HubSpot, handoff → Slack, conversation
  → Notion, closed → Sheets, Stripe → WA receipt, Calendly → tag).
- **Per-connector setup pages** at `/docs/integrations/{make,zapier,n8n}`
  — install, credentials, triggers/actions, trigger lifecycle, test
  snippets.
- **tsconfig** excludes `integrations/` so the Next.js build doesn't
  try to compile the standalone connector packages.

**External submissions** (one-time, do before launch — see pre-launch checklist)
- Submit Make.com app to developers.make.com → verification → public listing
- `cd integrations/zapier && zapier register "Xyra Chat" && zapier push && zapier promote 1.0.0`
- `cd integrations/n8n && npm install && npm run build && npm publish --access public` + register at n8n.io/integrations
- Cookbook deep links resolve once those listings exist.

**Security notes**
- API key plaintexts NEVER stored — SHA-256(plaintext + APP_PEPPER) only.
- Constant-time hash comparison even though we look up by UNIQUE index.
- SSRF guard on every outbound webhook URL at both subscribe time AND
  delivery time (DNS rebinding defense).
- Webhook signing secrets are 32 random bytes hex, shown ONCE.
- API request log captures method/path/status/duration/ip/UA but
  NEVER bodies (PII / secret safety).

## Week 12 — Stripe billing + entitlements (Session 1 DONE)

Entitlements-model billing, not fixed plan-string gates. Architectural
decision recorded 2026-05-28: ship four fixed bundles (Trial /
Starter / Pro / Enterprise) for self-serve checkout AND support
per-org custom deals via row-level entitlements + Stripe Custom
Quotes. Doing it this way upfront avoids a multi-day retrofit when
the first bespoke contract lands.

**Schema** — [`026_entitlements_and_stripe.sql`](supabase/migrations/026_entitlements_and_stripe.sql)
- `org_entitlements` — `(org_id, feature_key, value, source, expires_at,
  stripe_subscription_id, stripe_quote_id)`. Most-permissive wins across
  rows for the same (org, feature). UNIQUE on (org_id, source,
  feature_key) so bundle re-provisioning UPSERTs cleanly.
- `subscriptions` extended with `stripe_customer_id`,
  `stripe_subscription_id`, `stripe_price_id`, `status` (trialing /
  active / past_due / canceling / canceled / incomplete / unpaid),
  `current_period_end`, `cancel_at_period_end`, `canceled_at`,
  `data_retention_until`, `trial_ends_at`, `trial_source`,
  `trial_extended_count`.
- `provision_bundle_entitlements()` SECURITY DEFINER RPC — atomic
  swap-out of all `bundle:<plan>` rows for the org, replaced with
  fresh entitlements from the bundle definition. Per-org overrides
  (sources != `bundle:*`) survive.

**Library** ([`lib/billing/`](lib/billing/))
- `entitlements.ts` — single source of truth.
  `getEntitlement / hasFeature / getLimit (Infinity for -1 sentinel)
  / checkLimit / requireFeature / requireUnderLimit`. EntitlementError
  is the throwable variant. 5-second per-request cache.
- `bundles.ts` — four bundles (Trial / Starter / Pro / Enterprise),
  each declaring its full entitlement set as code.
  `bundleFromStripePriceId` maps Stripe Price IDs back to bundles.
- `stripe.ts` — lazy SDK singleton, env-driven price lookup
  (`STRIPE_PRICE_<BUNDLE>_<INTERVAL>`).
- `provision.ts` — `provisionBundle()` (calls the RPC),
  `clearAllBundleEntitlements()` (full cancellation cleanup).

**Routes**
- `POST /api/billing/checkout` — owner-only. Creates/reuses Stripe
  Customer. `allow_promotion_codes: true` so Session 3's promo codes
  work natively. Metadata carries `org_id` + `bundle_id` for the
  webhook handler.
- `POST /api/billing/portal` — opens Stripe Customer Portal.
- `POST /api/webhooks/stripe` — signature-verified. Handles
  `checkout.session.completed` (provision), `subscription.updated`
  (re-provision for plan change), `subscription.deleted` (clear
  bundle + start 30-day retention), `invoice.paid` (reset AI tokens),
  `invoice.payment_failed` (past_due). Defensive helpers
  (`invoiceSubscriptionId`, `subscriptionPeriodEndIso`) accept both
  the pre-2026-05 and post-2026-05 Stripe API shapes.

**Backward compatibility**
- `subscriptions.plan` stays as a UI label only — gates now query
  `checkEntitlement(orgId, key)`. Session 2 refactors every existing
  plan-string callsite to use entitlements.

**Env additions** (full block in [.env.example](.env.example))
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_{STARTER,PRO,ENTERPRISE}_{MONTHLY,YEARLY}`
- `STRIPE_CHECKOUT_SUCCESS_URL`, `STRIPE_CHECKOUT_CANCEL_URL`

**Operator setup**
1. Apply migration 026 in Supabase SQL Editor.
2. Stripe Dashboard → create products + prices for Starter (€39/mo,
   €374/yr), Pro (€99/mo, €950/yr), Enterprise (€249/mo, €2390/yr).
3. Copy `price_xxx` IDs into matching env vars.
4. Stripe Dashboard → Webhooks → add endpoint
   `https://xyra-chat.vercel.app/api/webhooks/stripe`, subscribe to
   the five events above. Paste Signing Secret into
   `STRIPE_WEBHOOK_SECRET`.
5. Local dev: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

**Session 2 — DONE (2026-05-29)**
- **Fail-open backstop** — `lib/billing/entitlements.ts` `isProvisioned(orgId)`:
  an org with ZERO entitlement rows passes EVERY gate (hasFeature→true,
  getLimit→Infinity). Once it has ≥1 row it's enforced strictly. This is
  what lets the live app keep working before the operator backfills — no
  org is ever blocked by the refactor landing. (Hardened post-review: a
  transient DB error on the provisioned check fails open but is NOT
  cached, so a paid org snaps back to strict enforcement on the next call.)
- **`lib/billing/gates.ts`** — `assertCanAddChannel` (count + per-type),
  `assertCanAddBot`, `assertCanAddKnowledgeSource` (per-bot), `assertCanInviteMember`,
  `assertCanCreateBroadcast` (feature + monthly count), `assertCanUseAutomations`.
  Each counts live usage and returns `{ ok, error }`.
- **Gates wired** into all 5 channel-create paths (WA/IG/Telegram/Email
  manual forms + IG OAuth callback), `createBot`, both knowledge-source
  paths, `inviteTeamMember`, `createBroadcast`.
- **`createApiKey`** refactored off the deleted `lib/billing/plans.ts`
  onto `api:read` / `api:write` entitlements.
- **`/settings/billing`** rebuilt on bundles + entitlements: live usage
  meters (channels / team / bots / broadcasts / AI tokens), monthly|yearly
  plan comparison, Stripe checkout (`UpgradePanel`) + portal buttons.
- **`/settings/admin/entitlements`** operator console (`lib/billing/admin-actions.ts`):
  `provisionOrgBundle`, `backfillUnprovisionedOrgs` (one-click launch
  backfill → Trial), `grantEntitlement` / `revokeEntitlement` per-org.
  Operator = owner of `XYRA_OPERATOR_ORG_ID` (any owner when env unset,
  pre-launch). **This is the backfill tool** — point it at your org +
  pick a bundle.
- **`lib/billing/plans.ts` DELETED** — single plan model now (entitlements).
- Verified by a 22-agent adversarial workflow (fail-open contract holds
  end-to-end; entitlement keys in gates match bundle definitions; gates
  fire before inserts; admin actions operator-gated). Only finding was
  the isProvisioned error-cache edge, now fixed.

**Note on the local-toolchain incident (2026-05-29):** the repo lives in
a OneDrive folder; `node_modules` got cloud-offloaded to dataless
placeholders and reads started timing out (ETIMEDOUT errno -60). Operator
quit OneDrive + we reinstalled `node_modules` as real local files +
cleared `.next`. Builds work again. **`.env.local` is still a OneDrive
placeholder** — `npm run dev` may warn it can't load env; re-hydrate it
(open OneDrive once) or recreate `.env.local` from `.env.example`. Prod
is unaffected (Vercel uses its own env). Long-term: move the repo off
OneDrive or keep the folder "always on this device".

**Session 3 — DONE (2026-05-30)**
- **Migration 027** — `promo_codes`, `promo_redemptions`,
  `cancellation_feedback`, `disputes` tables + RLS (promo/dispute are
  service-role-only; cancellation_feedback has an org-scoped INSERT
  policy). Plus `soft_delete_org(org_id)` SECURITY DEFINER cascade and
  the daily `retention_purge` pg_cron job (reuses the `app_config`
  cron_secret pattern from migration 025).
- **Promo codes** ([lib/billing/promo.ts](lib/billing/promo.ts)) —
  `createPromo` makes a Stripe Coupon + Promotion Code for discount/
  free_month/custom_quote kinds; trial/trial_extension kinds skip Stripe
  and bump `subscriptions.trial_ends_at` directly. `redeemPromo`
  attaches the coupon to a live sub OR extends the trial; generic
  "invalid or expired" error for all failure modes (anti-enumeration);
  one-redemption-per-org. Operator actions in
  [lib/billing/promo-actions.ts](lib/billing/promo-actions.ts)
  (create/disable + `seedLaunchPromos` → LAUNCH50/FREEMONTH/BETA90).
  Admin UI at `/settings/admin/promos`.
- **Customer redeem** — `POST /api/billing/promo/redeem` (owner-only,
  in-memory 5/hour rate limit). "Have a code?" box on `/settings/billing`.
- **Cancellation** — `POST /api/billing/preview-downgrade` returns
  blockers when the org exceeds the target plan's limits (block-and-
  prompt). Reason-capture modal on the Cancel button → 
  `recordCancellationFeedback` ([lib/billing/cancellation-actions.ts](lib/billing/cancellation-actions.ts))
  logs to `cancellation_feedback` before redirecting to the Stripe Portal.
- **Retention purge** — `POST/GET /api/internal/retention-purge`
  (CRON_SECRET-authed) finds `status='canceled'` subs past
  `data_retention_until`, runs `soft_delete_org`, then clears the marker.
  Soft-delete only; never touches active/trialing orgs.
- **Disputes** — Stripe webhook now handles `charge.dispute.created`
  (records the dispute, pauses the org to `past_due`, auto-submits
  evidence via [lib/billing/dispute-evidence.ts](lib/billing/dispute-evidence.ts)),
  `.updated`/`.closed` (status sync). Evidence is assembled from org +
  owner identity + usage proof (channels/bots/conversations counts) +
  policy links. Admin UI at `/settings/admin/disputes` (force-submit +
  notes). **Add the dispute events to the Stripe webhook subscription**
  in the dashboard: `charge.dispute.created`, `.updated`, `.closed`.
- **Promo redemption on checkout** — webhook records a redemption +
  bumps `redemption_count` when a discount is applied at Checkout.
- **`<BillingBanner />`** in the dashboard layout — one dismissible
  (per-session) banner driven by subscription status: past_due →
  retention countdown → canceling → trial-ending (≤3d) → AI usage ≥80%.

**Adversarial review (23-agent workflow) caught + fixed before ship:**
- **Middleware was 401'ing every Bearer/secret-authed API** — `/api/v1/*`
  (public REST API), `/api/internal/*` + `/api/cron/*` (cron jobs), and
  `/api/broadcasts/send-internal` were NOT in `isPublicPath`, so the
  session-cookie gate rejected them before the handler's own auth ran.
  This silently broke the entire Week 11 public API + the webhook-retry
  + retention crons (pg_cron reported "succeeded" because the SQL
  function fired http_post; the request itself got 401). Fixed in
  [lib/supabase/middleware.ts](lib/supabase/middleware.ts) — those
  families are now exempt (they auth via Bearer/HMAC inside the handler).
- **Promo trial TOCTOU** — `redeemPromo` now claims the redemption slot
  via an INSERT guarded by `UNIQUE(promo_code_id, org_id)` BEFORE any
  benefit, + an atomic `extend_trial` RPC (GREATEST, server-side), so
  parallel requests can't stack free trial days.
- **Dispute evidence double-submit** — atomic claim of
  `evidence_submitted_at` (conditional UPDATE … WHERE … IS NULL) so
  re-delivered `dispute.created` events submit to Stripe once.
- **Dispute status clobber** — `onDisputeCreated` no longer regresses a
  newer status on out-of-order re-delivery (insert-if-absent only).

**Operator console URLs** (owner of XYRA_OPERATOR_ORG_ID, or any owner
pre-launch): `/settings/admin/entitlements`, `/settings/admin/promos`,
`/settings/admin/disputes`. Not yet in the settings nav — reach by URL.

**Week 12 is COMPLETE.** Operator setup checklist (apply migrations
026+027, create Stripe products/prices/webhook/keys, run the backfill)
is in the project_billing_operator_setup memory.

## Week 13 — React Native mobile app (DONE)

Companion app for agents on the go, living in [`mobile/`](mobile/) as a
separate Expo package in the monorepo (excluded from the Next.js
tsconfig + eslint so the web build never touches it). Built before launch
(Junior's call — wants the product to feel complete at ship despite the
spec flagging it as v1.2-deferrable).

**Stack** — Expo SDK 54 (RN 0.81.5, React 19.1), TypeScript, React
Navigation v7 (native-stack + bottom-tabs), React Native Paper (themed to
Xyra brand), `@supabase/supabase-js`.

> **SDK pin (intentional, dev-preview only):** scaffolded on the latest SDK
> 56 but pinned down to **SDK 54** because the test iPhone's stock Expo Go is
> 54.0.2 (iOS Expo Go lags new SDKs; that device's iOS caps it at 54). Expo
> Go runs only its own single SDK, so the project SDK must match to preview
> without a dev build. `mobile/.npmrc` sets `legacy-peer-deps=true`. **Bump
> back to the latest SDK** (`npm install expo@latest && npx expo install
> --fix`) when we move to real EAS builds for launch — the pin is purely so
> Expo Go can open it now. `expo-image` must NOT be in app.json `plugins` on
> SDK 54 (no config plugin until a later SDK).

**Auth + session** ([`mobile/src/lib/`](mobile/src/lib/))
- `storage.ts` — `LargeSecureStore`: AES-encrypts the Supabase session, AES
  key in the device Keychain/Keystore (`expo-secure-store`), ciphertext in
  AsyncStorage. Handles sessions larger than SecureStore's ~2KB cap
  (Supabase's official Expo pattern).
- `supabase.ts` — client with that storage, `autoRefreshToken`, focus-based
  refresh start/stop on `AppState`.
- `auth/AuthContext.tsx` — session + profile + `signIn` / `signOut` /
  `setAvailability` (direct RLS UPDATE on own profile — allowed by the
  migration-001 self-update policy). Auto-login on launch.

**Screens** ([`mobile/src/screens/`](mobile/src/screens/)) — Login (dark,
gradient wordmark), ConversationList (All/Mine/Open filter tabs,
pull-to-refresh, skeleton, realtime), ChatDetail (inverted bubbles, image
preview modal, assign-to-me + close/reopen via RLS UPDATE, composer →
send), Contacts (searchable), ContactProfile (details + tags + this
contact's conversations → deep link), Notifications (my open conversations
+ enable-push card, drives the tab badge), Settings (profile, availability
segmented toggle, push status, version, sign out).

**Realtime** ([`mobile/src/hooks/`](mobile/src/hooks/)) — `useConversations`,
`useThread`, `useMyAssigned`. All Supabase Realtime, RLS-scoped to the
agent's org (multi-tenant safe by construction — same RLS as web).

**Sending** — `mobile/src/lib/api.ts` posts to the web app's
`/api/channels/{provider}/send` with the Supabase access token as a
`Bearer`. This required a web-side change: **`lib/supabase/route-auth.ts`**
→ `getRouteUser(req)` accepts a session **cookie OR a Supabase JWT Bearer**;
the 4 send routes now use it, and `lib/supabase/middleware.ts` exempts
`/api/channels/` (handlers self-auth — the cookie-only middleware gate would
401 the mobile app before its handler ran; same bug class as the Week 12
public-API middleware fix). New message renders via the Realtime
subscription (no optimistic insert).

**Push notifications**
- Migration [`028_push_tokens.sql`](supabase/migrations/028_push_tokens.sql)
  — `push_tokens(user_id, org_id, token, platform, …)`, RLS (own rows only),
  a trigger that derives `org_id` from the profile (not client-spoofable),
  soft-delete + explicit grants per the Data-API convention.
- Client: `mobile/src/lib/push.ts` registers the Expo push token on login
  (UPSERT) and removes it on logout. Foreground handler shows banners.
- Server: `lib/push/expo.ts` (Expo Push API client, chunked, never throws) +
  `lib/push/notify.ts` (`notifyNewInbound` — wakes the **assigned** agent's
  devices, prunes DeviceNotRegistered tokens). Wired fire-and-forget into the
  WA / IG / Telegram inbound webhooks after the existing `emit()`.
- Tapping a notification deep-links to the conversation (cold-start +
  runtime), via `mobile/src/navigation/ref.ts` + `App.tsx`.

**Config** — `mobile/app.json` (name "Xyra Chat", bundle/package
`com.xyrachat.app`, dark UI, brand splash + adaptive icon bg, notifications
plugin color `#9333EA`), `mobile/eas.json` (development / preview /
production profiles; public `EXPO_PUBLIC_*` baked into each profile's env).
`mobile/README.md` documents run / EAS build / store submit.

**Verified** — `npx tsc --noEmit` clean in `mobile/`; `npm run build` clean
on the web app after the route-auth / middleware / webhook edits.

**Post-test polish (from on-device testing 2026-06-01/02)**
- Realtime: each hook now uses a unique channel topic (`mobile/src/lib/uid.ts`)
  — `useMyAssigned` is mounted twice (tab badge + Notifications) and collided
  on one topic ("cannot add postgres_changes callbacks after subscribe()").
- Keyboard: composer uses `useHeaderHeight()` as the KeyboardAvoidingView
  offset; the bottom tab bar is hidden on ChatDetail (full-screen thread).
- Composer gained **AI Assist** (improve/friendlier/professional/shorter/
  fix-grammar), **Suggest reply** (bot-grounded), and a **Reply|Note** toggle
  (internal notes inserted directly with `is_internal_note=true`). The web
  `/api/ai/message-assist` + `/api/ai/suggest-reply` now accept the mobile JWT
  via `getRouteUser`; middleware exempts `/api/ai/`.
- Settings expanded: workspace name + switch, Support (help / report-a-problem
  with diagnostics), privacy/terms links.
- Push: skip token fetch (and its warning) when there's no EAS projectId.

**Feature additions (2026-06-02, web + mobile)** — built on top of Week 13:
- **Templates from mobile** — WhatsApp conversations get a template picker in
  the composer ({{N}} variable fill, contact name prefilled) → existing
  `/api/channels/whatsapp/send` (`type:"template"`). `mobile/src/lib/templates.ts`,
  `TemplatePicker.tsx`.
- **Team chat** — org-wide team room (migration 029 `team_messages`). Web
  `/team-chat` + sidebar entry; mobile "Team" tab. Realtime, RLS-scoped.
- **Multi-org workspace switching** — migration 030 `memberships` +
  `switch_active_org` RPC + `create_additional_workspace`. Active org =
  `profiles.org_id` (RLS unchanged); a trigger keeps memberships in sync.
  Web: WorkspaceSwitcher in the sidebar (list/switch/create). Mobile: Settings
  switcher (list/switch; create on web). **Tenant-isolation fix**: revoked
  direct `profiles.org_id`/`role` UPDATE from authenticated — previously a user
  could self-reassign org_id to any org and read its data. `removeTeamMember`
  now revokes the membership too.
- **Invite existing users + membership-based team management** — inviting an
  email that already has an account adds/revives a membership directly (so two
  separate accounts can share workspaces), instead of the email invite that
  rejects existing emails. Team reads (`getTeamSnapshot`/`getOrgMembers`),
  role changes, removal, and the seat-limit gate are all sourced from
  `memberships` (per-org roles) rather than `profiles.org_id`, so a teammate
  whose active workspace is elsewhere still appears + is assignable in this org.

**⚠️ Operator: apply migrations 029 + 030 in Supabase.** After 030, smoke-test
that login + set-availability + onboarding still work (the profiles column-grant
hardening is the sensitive bit — failure mode is "can't update profile",
fail-closed, not a leak).

**Still deferred (post-launch)**
- **Per-session active org** — switching changes the active org globally
  (profiles.org_id is one column), so web + mobile follow the same active
  workspace. Per-device active org would need active-org in JWT claims.
- **Team chat DMs / channels** — current team chat is a single org-wide room.
- **Real store submission** (App Store / Google Play review, credentials,
  icons/screenshots) — Week 13 scope was "builds locally + EAS configured".
- **Push delivery needs `eas init`** to write `extra.eas.projectId`; until
  then push registration no-ops gracefully (rest of the app works).
- **Sending photos/files from mobile** — composer attach button shows a
  "coming soon" alert (blocked on the same media-outbound work deferred since
  Week 3). `expo-image-picker` is installed for when it lands.
- **Biometric login** (the spec mentioned it) — `expo-local-authentication`
  gate on top of the persisted session; quick follow-up.
- OneDrive note: `mobile/node_modules` is large; keep the folder
  "Always keep on this device" so Metro file-watching doesn't choke (same
  caution as the Week 12 OneDrive incident).

## Roadmap snapshot (what's next — Week 14)

Week 14: **Tauri desktop app** — native desktop wrapper (macOS/Windows/Linux)
for agents who live in the inbox all day. Week 15 onward is the debug/polish
+ launch-prep phase (see the project_pre_launch_checklist memory) — Meta App
Review is the longest-pole external dependency, start it early.

Also queued:
- Real WhatsApp media outbound (deferred from Week 3 — Meta media upload flow)
- Real media URL resolution for inbound media (currently we store media_id)
- Per-agent read tracking → real unread counts in the conversation list
- Saved replies CRUD
- Chooser UI when an OAuth-connected Facebook account has multiple
  IG-linked Pages (currently we auto-pick the first).
- Messenger channel (bundles into the same Meta App Review submission as
  Instagram).
- **WhatsApp Embedded Signup** — explicitly deferred from Week 9's scope.
  Manual entry still works fine for adding new WA channels; ESU is a
  client-onboarding polish item once the marketing site is live.

## Conventions

- Server actions for mutations (form posts) — preferred over `/api/*` route handlers unless the endpoint is for an external caller (webhook, GDPR).
- Use `supabase/server.ts` in RSCs and server actions; `supabase/client.ts` only in `"use client"` components that need realtime/auth.
- Never import `lib/supabase/admin.ts` from a client component. Lint will not catch it — review every PR for this.
- **Trusted server actions doing org-level mutations use the admin client.**
  Pattern: authenticate the caller via the user-scoped client (`getUser()`),
  enforce app-level invariants (e.g. one org per user), then mutate via
  `createAdminClient()`. RLS is the gate for client-direct queries; fighting
  RLS from inside an authenticated server action is the wrong shape. See
  `app/(auth)/onboarding/page.tsx` for the canonical example.
- Tables: snake_case. TypeScript types: PascalCase. Re-generate types via `supabase gen types typescript --linked > lib/db-types.ts` (Week 2 once linked).
- **Every new `CREATE TABLE` migration MUST bundle explicit GRANTs.**
  Supabase removed Data-API auto-grants for `public` tables (discussion
  #45329); applies to our project from **2026-10-30**. Existing tables
  are safe; new ones aren't. Pattern: `GRANT ALL ON public.<t> TO
  service_role;` (our admin client — the one that breaks the app if
  missed) plus `GRANT SELECT[, INSERT, UPDATE, DELETE] ON public.<t> TO
  authenticated;` for RLS-gated org tables the user-scoped client reads/
  writes. Operator/service-only tables (e.g. promo_codes, disputes):
  service_role only. See the project_supabase_data_api_grants memory.

## Open issues / notes

- `package.json` `name` is `xyra-chat` (npm-friendly). The directory name "Xyra Chat" caused `create-next-app` to refuse `.` as target — scaffold landed in `xyra-chat/` and was moved up.
- `components.json` `style` is `"radix-nova"` (shadcn 2026 default). `baseColor` is `"neutral"` — Xyra brand tokens override the relevant CSS vars in [app/globals.css](app/globals.css).
- Vercel CLI not installed locally yet. Recommend `npm i -g vercel` for `vercel env pull` and `vercel deploy` from terminal.
- **Git not yet initialised**: `git init` failed during setup with the macOS Xcode license prompt (`You have not agreed to the Xcode license agreements`). Resolve once with `sudo xcodebuild -license accept`, then run `git init && git add . && git commit -m "Week 1 foundation"`.
- **Next 16 deprecation warning**: `middleware.ts` still works in Next 16 but the framework now calls the concept "proxy". When upgrading away from this warning, rename `middleware.ts` → `proxy.ts` and update the import in `lib/supabase/middleware.ts` accordingly. No behavioural change.
- **Toast component**: shadcn replaced `toast` with `sonner` in late 2025. Spec listed `toast`; we installed `sonner` and the root layout renders `<Toaster theme="dark" richColors />`. Use `import { toast } from "sonner"` everywhere.
- **PostHog client/server split**: Initial unified `lib/analytics.ts` broke the Turbopack client build because `posthog-node` pulls `node:fs`. Split: browser code in [lib/analytics.ts](lib/analytics.ts), server code in [lib/analytics-server.ts](lib/analytics-server.ts) (with `import "server-only"`). Never import `analytics-server` from a `"use client"` file.
