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
| `META_APP_SECRET` | server only | Meta App Dashboard → Settings → Basic → App secret. Used for `X-Hub-Signature-256` HMAC verification on inbound webhooks. Shared across WhatsApp, Instagram, Messenger (same Meta app). |

WhatsApp channel access tokens are NOT in env — they're stored per-channel in
Supabase Vault. Only the vault UUID lives in `channels.access_token_vault_id`.

Local dev: copy `.env.example` → `.env.local`. Production: set in Vercel project settings (also via `vercel env add`).

## File structure (Week 1 baseline)

```
app/
  (auth)/
    layout.tsx              # Centered card, Xyra logo, gradient backdrop
    login/page.tsx          # Email + password sign-in
    signup/page.tsx         # Name + email + password sign-up
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
  api/
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
- Authenticated visiting `/login` or `/signup` → redirect `/dashboard`
- Public: `/`, `/privacy`, `/terms`, `/api/gdpr/*` (which do their own auth)

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
  metadata payload. Owners + admins only
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

## Roadmap snapshot (what's next — Week 5)

Week 5: **Instagram DM integration** (per user spec) — webhook subscription,
inbound message ingest with `ig_message_id` idempotency (already in schema),
send via Graph API, channel onboarding UI.

Also queued for Week 5+:
- Real WhatsApp media outbound (deferred from Week 3 — Meta media upload flow)
- Real media URL resolution for inbound media (currently we store media_id)
- Per-agent read tracking → real unread counts in the conversation list
- Telegram channel (probably Week 6)
- Saved replies CRUD (Week 5 placeholder we ship now)

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

## Open issues / notes

- `package.json` `name` is `xyra-chat` (npm-friendly). The directory name "Xyra Chat" caused `create-next-app` to refuse `.` as target — scaffold landed in `xyra-chat/` and was moved up.
- `components.json` `style` is `"radix-nova"` (shadcn 2026 default). `baseColor` is `"neutral"` — Xyra brand tokens override the relevant CSS vars in [app/globals.css](app/globals.css).
- Vercel CLI not installed locally yet. Recommend `npm i -g vercel` for `vercel env pull` and `vercel deploy` from terminal.
- **Git not yet initialised**: `git init` failed during setup with the macOS Xcode license prompt (`You have not agreed to the Xcode license agreements`). Resolve once with `sudo xcodebuild -license accept`, then run `git init && git add . && git commit -m "Week 1 foundation"`.
- **Next 16 deprecation warning**: `middleware.ts` still works in Next 16 but the framework now calls the concept "proxy". When upgrading away from this warning, rename `middleware.ts` → `proxy.ts` and update the import in `lib/supabase/middleware.ts` accordingly. No behavioural change.
- **Toast component**: shadcn replaced `toast` with `sonner` in late 2025. Spec listed `toast`; we installed `sonner` and the root layout renders `<Toaster theme="dark" richColors />`. Use `import { toast } from "sonner"` everywhere.
- **PostHog client/server split**: Initial unified `lib/analytics.ts` broke the Turbopack client build because `posthog-node` pulls `node:fs`. Split: browser code in [lib/analytics.ts](lib/analytics.ts), server code in [lib/analytics-server.ts](lib/analytics-server.ts) (with `import "server-only"`). Never import `analytics-server` from a `"use client"` file.
