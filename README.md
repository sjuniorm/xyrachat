# Xyra Chat

> One inbox for every customer conversation. WhatsApp, Instagram, Messenger and live chat — unified, automated, and built for teams.

Xyra Chat is a multi-platform customer messaging SaaS (Superchat / ManyChat-style). Owners connect channels, agents reply from a unified inbox, and automations / bots / broadcasts run on top.

Reference: [xyrachat.com](https://xyrachat.com)

## Stack

- **Next.js 16** (App Router, Turbopack, React Compiler) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui** (Radix base, Nova preset)
- **Supabase** — Auth, Postgres + pgvector, Storage, Realtime
- **PostHog** (EU host) — analytics + feature flags
- **Vercel** — hosting via GitHub auto-deploy

## Getting started

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_POSTHOG_KEY

# 3. Apply the database migration
# Open Supabase Studio → SQL Editor and paste:
#   supabase/migrations/001_initial.sql
# Or, with the Supabase CLI:  supabase db push

# 4. Run the dev server
npm run dev
```

Then visit [http://localhost:3000](http://localhost:3000).

## Required environment variables

| Var | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only — for GDPR delete + webhooks. **Never expose to the client.** |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project key |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` (EU hosting for GDPR) |

## Deployment

This project deploys to **Vercel** via GitHub. After pushing to GitHub:

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Add all five environment variables in **Project Settings → Environment Variables** (Production + Preview + Development).
3. Vercel auto-detects Next.js and builds with Turbopack.

CLI alternative:

```bash
npm i -g vercel
vercel link
vercel env pull .env.local   # sync env from Vercel
vercel deploy --prod         # production deploy
```

## Project layout

See [CLAUDE.md](./CLAUDE.md) for the full file structure, brand tokens, schema notes, GDPR baseline, and the Week-2 roadmap.

## Privacy / GDPR

- **PostHog session recording is disabled** so customer message contents are never captured.
- **EU hosting** (`eu.i.posthog.com`) for analytics.
- Every table that holds PII has a `deleted_at` column — we soft-delete only.
- `/api/gdpr/export` — right-of-access JSON dump.
- `/api/gdpr/delete` — right-of-erasure (soft-delete + auth user removal).
- Cookie banner appears for EU visitors only (Vercel geo headers).

## License

Proprietary — all rights reserved.
