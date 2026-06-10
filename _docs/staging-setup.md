# Staging / "double deployment" — test before it hits the live app

Goal: ship + test changes on a separate URL with a separate database, then
promote to production — without ever risking the live app or real customer data.

## The model (recommended: one Vercel project, two environments)
Vercel already builds a **Preview** deployment for every branch/PR and a
**Production** deployment for `main`. The only missing piece is that previews
must NOT touch the production database. So: point **Preview env vars at a
separate Supabase project.**

```
main branch        → Production deploy  → PROD Supabase   (real customers)
any other branch   → Preview deploy     → STAGING Supabase (safe to break)
```

## One-time setup

### 1) Create a staging Supabase project
- Supabase → New project → `xyra-chat-staging` (EU/Frankfurt, same region).
- Enable **Vault** (Project Settings → Vault) — channels need it.
- Apply **every migration** (001 → 051) in order in the SQL editor (or
  `supabase db push` if you link the CLI to staging). This gives staging the
  same schema as prod, with empty/test data.
- Copy its URL + anon key + service-role key.

### 2) Scope Vercel env vars per environment
In Vercel → Settings → Environment Variables, for each Supabase var set TWO
values:
- **Production** → the PROD Supabase values (already set).
- **Preview** → the STAGING Supabase values:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY`
- Do the same split for anything environment-specific you want isolated
  (e.g. a TEST `STRIPE_SECRET_KEY` + test webhook secret for Preview; a separate
  `XYRA_OPERATOR_ORG_ID` if your staging operator org differs; PostHog can stay
  shared or use a separate project key for Preview).
- Leave non-sensitive shared vars (e.g. ANTHROPIC_API_KEY) on "All".

### 3) Workflow
```
git checkout -b feature/x      # work on a branch
git push                       # Vercel builds a Preview URL (uses STAGING)
# → test on the xyra-chat-git-feature-x-….vercel.app URL
git checkout main && git merge feature/x && git push   # Production deploy (PROD)
```
You're already doing branch-based work — this just makes previews safe.

## Migrations discipline (the important bit)
- Apply a new migration to **staging Supabase first**, test the feature on the
  Preview URL, THEN apply it to prod when you merge.
- Keep prod migrations append-only + idempotent (we already do: `IF NOT EXISTS`,
  `CREATE OR REPLACE`).

## Caveats (things that don't auto-stage)
- **External webhooks** (Meta, Stripe, Telegram, Resend) point at PROD URLs.
  Staging won't receive real inbound unless you register staging callback URLs
  in a separate Meta/Stripe **test** app/account. For most UI/logic testing you
  don't need this; for end-to-end channel testing on staging, use test apps +
  sandbox numbers.
- **Cron jobs** (pg_cron) live per-Supabase-project — staging has its own; point
  its `app_config` cron URLs at the staging deployment if you test crons.
- The **mobile app** (EAS) builds against `EXPO_PUBLIC_*` — add a staging EAS
  profile if you want a staging build.

## Optional: a dedicated staging Vercel project
If you'd rather a stable `staging.xyrachat.com` URL (vs. per-branch preview
URLs): create a second Vercel project from the same repo, set its Production
branch to `staging`, give it the staging env vars + a `staging.` subdomain. More
moving parts; the Preview-env approach above is simpler and usually enough.
