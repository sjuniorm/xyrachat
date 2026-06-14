# Xyra Chat — Launch runbook (2026-06-09 sprint)

All app CODE is done + pushed. This is the operator/external sprint. Ordered by
lead time — **start Meta first** (it's the long pole). Claude can drive/verify
each step; items marked 🧑 need your accounts/access.

---

## 0) Apply pending migrations (Supabase SQL editor) — 2 min
Run any not-yet-applied, in order. 040–053 applied as of 2026-06-14.
- `043_harden_team_messages_update_policy.sql` — team chat RLS hardening
- `044_trial_reminders.sql` — trial-reminder column + daily pg_cron
- `045_chat_media_private.sql` — flips chat-media bucket private
- `046_messenger_channel.sql` · `047_sequences.sql` · `048_webchat_channel.sql`
  · `049_conversation_metadata.sql` · `050_saved_replies_2.sql`
  · `051_conversation_ratings.sql` · `052_bot_reply_feedback.sql`
  · `053_support_access.sql`
- ⏳ **`054_bot_feedback_notifications.sql`** — NEW (2026-06-14): dedupe table so
  the bot-👎 support-alert email fires at most once per reply. **Apply this.**
After 044: it reuses the existing `app_config.cron_secret` + `http` extension
(already set for webhook-retry/retention) — no new setup.

## 1) 🧑 Meta App Review (LONGEST POLE — start first)
Goal: take Instagram + WhatsApp out of dev-mode so real customers work.
1. **Business verification** at business.facebook.com → Security Center: legal
   entity **Mll Nexus Group SL**, business docs (registration / utility bill),
   business email on the domain, website **xyrachat.com** live w/ privacy+terms+gdpr.
2. **App Review → Permissions**: request
   `instagram_business_manage_messages` (+ `instagram_business_basic`),
   `whatsapp_business_messaging`, `whatsapp_business_management`,
   `pages_messaging` (Messenger). Each needs a **screencast** demoing the
   real use (customer DMs → unified inbox → reply; opt-out).
3. Privacy-policy alignment: the data-use described must match what we do
   (store messages/contacts; subprocessors list on /privacy).
4. App stays in dev-mode until approved — only testers work meanwhile.
Claude will prep the per-permission justification text + screencast script.

## 2) 🧑 Resend domain + emails
**Status (2026-06-10):** `xyrachat.com` verified for OUTBOUND. `RESEND_API_KEY` +
`EMAIL_FROM_ADDRESS` set in Vercel. ⏳ **TODO before launch — inbound Email
channel:** needs a 2nd Resend domain (paid plan) e.g. `mail.xyrachat.com` with
**MX → Resend** (do NOT MX the root xyrachat.com — it'd hijack business email) +
`RESEND_WEBHOOK_SECRET` + `INBOUND_EMAIL_DOMAIN`. Customers can't email INTO the
inbox until this is done.

1. Resend → Domains → add **xyrachat.com** (or mail.xyrachat.com) → add the
   DNS records (SPF/DKIM/DMARC) at the registrar → verify.
2. Vercel env: `EMAIL_FROM_ADDRESS=Xyra Chat <noreply@xyrachat.com>`,
   confirm `RESEND_API_KEY` set. (Inbound email channel also needs MX → Resend
   + `RESEND_WEBHOOK_SECRET` + `INBOUND_EMAIL_DOMAIN`.)
   → Once verified, the lib/email transactional sends (welcome / trial / payment)
   start delivering automatically.
3. **Brand the 4 Supabase auth emails**: paste from `_docs/email-templates.md`
   into Supabase → Auth → Emails (Confirm signup / Magic Link / Reset Password /
   Change Email). Turn ON "Confirm email" for production.
4. Test: trigger /forgot-password → confirm the branded reset email arrives.

## 3) 🧑 Stripe go-live
1. Create Products + Prices (live mode), **annual = 2 months free (~17% off)**:
   Starter €39/mo (€390/yr) · **Growth €99/mo (€990/yr)** · Pro €199/mo
   (€1990/yr) · Enterprise €399/mo (custom). (Match lib/billing/bundles.ts.)
   Optional: create a `LAUNCH40` Promotion Code (40% off, **repeating 3 months**)
   for the founder early-bird — or seed via /settings/admin/promos.
2. Vercel env: `STRIPE_PRICE_{STARTER,GROWTH,PRO,ENTERPRISE}_{MONTHLY,YEARLY}` =
   the `price_…` ids; `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. Webhook endpoint → `https://<app>/api/webhooks/stripe`, subscribe to:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.trial_will_end`,
   `invoice.paid`, `invoice.payment_failed`, `charge.dispute.created/.updated/.closed`.
   Paste signing secret → `STRIPE_WEBHOOK_SECRET`.
4. **Backfill existing orgs**: `/settings/admin/entitlements` → backfill
   un-provisioned orgs → Trial (new signups now auto-provision Trial; this
   catches orgs created before that landed).

## 4) Post-deploy security finalization
- 🧑 **Set `XYRA_OPERATOR_ORG_ID`** in Vercel = your (Xyra team's) org UUID
  (Supabase → organizations table). REQUIRED: the operator consoles
  (`/settings/admin/{entitlements,promos,disputes,restore,metrics}`) now fail
  CLOSED in production when this is unset — nobody can reach them. Once set, only
  owners of that org can. Set it **before** running the entitlements backfill in
  step 3 (you need console access for that).
- 🧑 **Upstash**: set `UPSTASH_REDIS_REST_URL/TOKEN` in Vercel. This ACTIVATES
  rate limiting (auth/AI/channels/v1) + the new AI flood guard (both fail-open
  until set).
- 🧑 **Supabase Auth**: lower the auth rate limits + enable native **CAPTCHA**
  on sign-in / sign-up / recovery (covers login brute-force — no app route to
  throttle).
- 🧑 **Sentry**: create the project, set `NEXT_PUBLIC_SENTRY_DSN` (+
  `SENTRY_AUTH_TOKEN`/org/project for source maps). Verify via `/api/debug/sentry`.
- **Run the probe**: `PROBE_BASE_URL=<staging> … npx tsx tests/security/probe.ts`
  with two test-org JWTs + API keys.
- **CSP**: after the `/api/security/csp-report` endpoint shows 0 violations on
  real traffic, flip `Content-Security-Policy-Report-Only` → `Content-Security-Policy`
  in next.config.ts.

## 5) 🧑 VPS / n8n (Hetzner CX22)
1. Hetzner Console → server → **Rebuild** → Ubuntu 24.04 (wipes the junk).
2. Claude scripts: Docker + n8n behind Nginx + Let's Encrypt SSL + basic auth;
   ufw (22/80/443 only); fail2ban; SSH key-only, root login disabled.
3. (Optional) the outbound webhook-processor / cron worker if not on Vercel cron.

## 6) 🧑 Custom domain app.xyrachat.com (when ready)
Vercel domain + DNS → update Supabase Auth redirect URLs → update Meta webhook
callback URLs → re-run the full auth + webhook smoke test. See
project_custom_domain_switch memory.

## 7) Optional in-app config (env)
- `SUPPORT_FEEDBACK_EMAIL` — where the team is alerted when a client adds a note
  to a bot 👎 (e.g. `feedback@xyrachat.com`). Unset → no alert (feature still works).
- `NEXT_PUBLIC_SUPPORT_BOOKING_URL` — your Cal.com/Calendly link; shows a
  "Book a call" button in the 👎 note. Unset → button hidden.
- `SUPPORT_BOT_ID` — id of your "Xyra Helper" bot (operator org) → activates the
  in-app help widget's AI answers.
- `NEXT_PUBLIC_CANNY_APP_ID` + `NEXT_PUBLIC_CANNY_BOARD_TOKEN` + `CANNY_PRIVATE_KEY`
  → activates /roadmap.
- `NEXT_PUBLIC_APP_URL` — the app's public URL (used in emails + Canny SSO).

---

### Outstanding code (Claude, if not already shipped this session)
None blocking — all §15 code fixes are in. Remaining is the live probe run +
the CSP enforce flip (both post-deploy). Do NOT flip the public-launch switch
until Meta verification clears + the probe is green.
