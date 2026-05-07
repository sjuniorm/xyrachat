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
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Admin operations (GDPR delete, webhooks) — never expose to client |
| `NEXT_PUBLIC_POSTHOG_KEY` | client + server | PostHog project key |
| `NEXT_PUBLIC_POSTHOG_HOST` | client + server | `https://eu.i.posthog.com` (GDPR — EU hosting) |

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
    layout.tsx              # Branded sidebar (260px) + content area
    dashboard/page.tsx      # "Welcome to Xyra Chat" placeholder
    inbox/page.tsx          # Inbox placeholder
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
  ui/                       # shadcn primitives (button, input, card, sidebar, sheet, sonner, ...)
  brand/
    xyra-wordmark.tsx       # Two variants: `inline` (icon + gradient text) or `stacked` (full wordmark PNG)
  app/
    sidebar-nav.tsx         # Dashboard left nav
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
  analytics.ts              # PostHog browser client + identify/track/reset
  analytics-server.ts       # PostHog server client (`server-only`) — trackServer
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

## Roadmap snapshot (what's next — Week 2)

Week 2: **Channels — connect a WhatsApp Business sender.**
- `channels` table (provider, phone, status, encrypted credentials, `deleted_at`)
- Onboarding flow: `/dashboard/settings/channels/new`
- Webhook endpoint `app/api/webhooks/whatsapp/route.ts` (BotID-protected)
- `wa_templates` table for approved Meta templates
- Encrypt access tokens server-side (never store raw)

After Week 2: Inbox UI, conversations + messages tables, realtime subscriptions, agent assignment, then bots/automations/broadcasts.

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
