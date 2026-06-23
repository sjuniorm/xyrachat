# Xyra Chat — MASTER launch checklist (nothing skipped)

> Single source of truth for everything left before public launch. Per Junior:
> **do it all — nothing gets cut.** 🧑 = operator/dashboard · 🤖 = code · 🧑🤖 = both.
> Compiled from the 5-agent scan (104 findings) + this session's work. Last
> updated 2026-06-20. Check items off here as they're done.

---

## ✅ Already done this session (for reference)
- [x] 🤖 Full launch audit — 23 findings fixed + adversarially verified + build green
- [x] 🤖 GDPR cookie-consent gate (EEA gets no PostHog until Accept)
- [x] 🤖 GDPR delete cascade complete (migration 064) + `/api/gdpr/delete` cascades + **Delete-workspace** button on /settings/team
- [x] 🤖 CI gate (`.github/workflows/ci.yml` — typecheck + lint + build)
- [x] 🤖 Domain code prep — `NEXT_PUBLIC_APP_URL` wired; display/Tauri/mobile URLs → app.xyrachat.com
- [x] 🧑 `app.xyrachat.com` live on Vercel (SSL valid, /api/health db:up)
- [x] 🧑 Migration 063 applied · email templates pasted
- [x] 🤖 Docs: Meta App Review pack · marketing prompt · Supabase email templates · this checklist

---

## 🚨 Phase 1 — Blocking (no public launch without these)

### Meta (longest pole — start first)
- [ ] 🧑 Business Verification — Mll Nexus Group SL / CIF B88931977 (upload docs Monday, confirm code). Gates all App Review.
- [ ] 🧑 App Review "Xyra Chat": `whatsapp_business_messaging`, `whatsapp_business_management`, `pages_messaging` (+`pages_manage_metadata` if prompted) — screencast each round-trip. (_docs/meta-app-review-submission.md)
- [ ] 🧑 App Review "Xyra Chat-IG": `instagram_business_manage_messages` + `instagram_business_basic` — screencast connect→DM→reply.
- [ ] 🧑 App settings on BOTH apps: Privacy/Terms/Data-Deletion URLs + icon + category; flip to **Live** before submit.

### Marketing + legal
- [ ] 🧑 Marketing site updated (existing repo) + live at **xyrachat.com** (required for Meta verification + CTAs). (_docs/marketing-website-prompt.md — update prompt)
- [ ] 🧑 Counsel review /privacy + /terms → remove the "draft" amber banners (app/privacy/page.tsx, app/terms/page.tsx).
- [ ] 🧑 Publish a signable **DPA + versioned subprocessor list** (GDPR Art. 28).

### Stripe
- [ ] 🧑 Live activation (business details + CIF + IBAN).
- [ ] 🧑 Create 5 packs + 6 add-ons (live mode) → set all 16 `STRIPE_PRICE_*` + `sk_live`/`pk_live` in Vercel.
- [ ] 🧑 Live webhook → `/api/webhooks/stripe` (9 events) → `STRIPE_WEBHOOK_SECRET`.
- [ ] 🧑 Test add-on purchase flow (test card 4242 → confirm seat/limit rises) in test, then live.
- [ ] 🧑 Set `XYRA_OPERATOR_ORG_ID` in Vercel (consoles fail closed without it).
- [ ] 🧑 Run entitlements backfill (/settings/admin/entitlements → backfill → Trial).

### Database / Supabase
- [ ] 🧑 Apply migration **064** (GDPR cascade). Verify 054–063 all applied to prod.
- [ ] 🧑 Enable **PITR / automated backups** + do one test restore.
- [ ] 🧑 Verify **pg_cron + `http` ext + `app_config.cron_secret`** — webhook-retry, retention-purge, automation-runner, sequences, trial-reminders, snooze-wake all fire via pg_cron. Confirm each job scheduled + last run succeeded.
- [ ] 🧑 Auth: enable **"Confirm email"**, Site URL = app.xyrachat.com, redirect URLs include app.xyrachat.com.

### Domain switch (after app.xyrachat.com — mostly done; finish the dashboards)
- [ ] 🧑 Vercel env: `NEXT_PUBLIC_APP_URL=https://app.xyrachat.com` + Stripe checkout URLs → redeploy.
- [ ] 🧑 Supabase Auth Site URL + redirect URLs.
- [ ] 🧑 Resend inbound webhook URL → app.xyrachat.com.
- [ ] 🧑 Meta webhook callback + OAuth redirect URIs → app.xyrachat.com (when channels connected).
- [ ] 🧑 Smoke-test login + a channel inbound + password reset on the new domain.

### Security
- [ ] 🧑 Set **Upstash Redis** env (`UPSTASH_REDIS_REST_URL`/`_TOKEN`) — rate limits + flood guard + webchat abuse defense FAIL OPEN until set.
- [ ] 🧑 Supabase Auth: **leaked-password protection** (HIBP) ON, min length 8+, **CAPTCHA** (Cloudflare Turnstile) on signup/login/recovery.
- [ ] 🧑 Supabase security notifications ON (password/email changed, sign-in linked/removed, MFA added/removed).
- [~] 🧑🤖 **§15 live security probe** — the **unauthenticated suite passed 11/11 against app.xyrachat.com** (anon API/webhook/billing/channel access all rejected, no 500s, bad webhook sigs rejected). Still TODO: the cross-tenant / rate-limit / API-key / SSRF checks — set `PROBE_A_JWT`/`PROBE_B_JWT`/`PROBE_A_CONV`/`PROBE_A_APIKEY`/`PROBE_RO_APIKEY` from 2 test orgs (+ Upstash on) and re-run for the final go/no-go. (tests/security/probe.ts)

### Staging + monitoring
- [ ] 🧑 Stand up **staging** (separate Supabase EU project, migrations 001→064, Vercel Preview env + TEST Stripe) — needed to run the probe + test migrations. (_docs/staging-setup.md)
- [ ] 🧑 Create **Sentry** project → `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN`/ORG/PROJECT).
- [ ] 🧑 **Uptime monitor** on /api/health (Uptime Robot / Better Stack) + alerting; one for the marketing site too.
- [ ] 🧑 Verify PostHog prod env (EU) + core events fire.

### Email (channel)
- [ ] 🧑 Resend **Pro** + `mail.xyrachat.com` domain + MX → Resend; set `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN`; verify SPF/DKIM/DMARC green. (saved as the launch reminder)
- [ ] 🧑 Brand the 5 Supabase auth email templates — ✅ pasted; just confirm via /forgot-password test.

### Meta one-click connect (env, after approval)
- [ ] 🧑 Set `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID`, `NEXT_PUBLIC_MESSENGER_OAUTH_CONFIG_ID`, `INSTAGRAM_APP_ID`/`SECRET`, `META_APP_ID`. (Manual entry is the fallback; IG webhook HMAC needs INSTAGRAM_APP_SECRET.)
- [ ] 🧑🤖 Verify WA Embedded Signup + Messenger FB-Login OAuth round-trips against live Meta (built, untested).

---

## 🔭 Phase 2 — Junior wants these too (build before/around launch, not deferred)

### Features (🤖 code)
- [x] 🤖 **Media outbound on all channels** — WhatsApp / Telegram / Email / Instagram / Messenger / Webchat `send-media` routes shipped + composer wired (`MEDIA_CHANNELS`), with size/mime/magic-byte validation + a private `chat-media` bucket. (Mobile send is still a stub — see mobile-submission-checklist.md.)
- [x] 🤖 Inbound media URL resolution — stored provider media_id is resolved on demand via the auth'd `/api/media` proxy (org-ownership checked) when the inbox renders it.
- [ ] 🤖 Mobile: send photos/files (ChatDetail attach is a stub) + biometric login. (Needs a dev build to test — see mobile-submission-checklist.md.)
- [x] 🤖 Per-agent unread counts (migration 032 `conversation_reads`) + saved-replies CRUD (`lib/saved-replies/`) — already shipped; checklist was stale.
- [x] 🤖 Messenger multi-Page chooser — `/api/auth/messenger/oauth` returns the Page list on multi-Page accounts; the connect button shows a chooser (re-login + pageId). No more silent `pages[0]`. (d953e92)
- [x] 🤖 IG new-follower trigger — **not possible on Meta's API** (no follower list/ID); the builder now explains why + points to the "First message" trigger. (e7802f1)
- [x] 🤖 Pipedrive + Salesforce CRM connectors — shipped on the CrmClient abstraction. **Operator: set `PIPEDRIVE_CLIENT_ID/SECRET` + `SALESFORCE_CLIENT_ID/SECRET`, register the `/api/auth/{pipedrive,salesforce}/callback` redirects, then test (untested against live providers).** (22df441, 72817d0)
- [x] 🤖 "Social Lite" €19 IG-automations-only tier — bundle + fail-safe inbox gate (sidebar + both inbox routes) + plan-change provisioning fix. **Operator: add `STRIPE_PRICE_SOCIAL_LITE_MONTHLY/YEARLY`.** (7175dd8, a52db37)
- [ ] 🤖 Voice / PBX / SIP add-on (announced, `available:false`).
- [x] 🤖 Support "reply-as-support" write path — bounded internal-note action (operator + active grant + read_reply scope + tenant guard + audit; never customer-facing; NOT impersonation). Customer-facing send still deferred. (4cb739c)
- [ ] 🤖 Flip CSP Report-Only → enforced after /api/security/csp-report shows 0 violations (🧑 needs Sentry live).

### Testing / quality (🤖 code)
- [ ] 🤖 Authenticated + multi-tenant E2E specs (login→inbox→send, bot reply, tenant isolation).
- [ ] 🤖 CI gate ✅ done — gate Dependabot auto-merge on it.

### Ops / external (🧑)
- [ ] 🧑 Mobile: `eas init` (push needs projectId) → App Store + Google Play submission.
- [ ] 🧑 Tauri desktop: signer generate → pubkey in tauri.conf.json → signing GitHub secrets → Apple notarization + Windows cert.
- [ ] 🧑 Submit Make / Zapier / n8n connector listings.
- [ ] 🧑 Google Calendar OAuth verification (sensitive scopes + demo video); set `GOOGLE_CLIENT_ID`/`SECRET`. (Outlook done — remember to rotate `MICROSOFT_CLIENT_SECRET` before expiry.)
- [ ] 🧑 HubSpot public app (developers.hubspot.com) → `HUBSPOT_CLIENT_ID`/`SECRET` + redirect.
- [ ] 🧑 Help center / KB — **content written** (`_docs/help-center-content.md`); seed it into the help bot's Knowledge + set `SUPPORT_BOT_ID` before onboarding non-technical users.
- [ ] 🧑 Canny roadmap board env (`NEXT_PUBLIC_CANNY_*`) for /roadmap.
- [ ] 🧑 Public changelog surface (in-app toast wired at 1.15; consider xyrachat.com/changelog).
- [ ] 🧑 Optional in-app config envs: `SUPPORT_FEEDBACK_EMAIL`, `SUPPORT_BOT_ID`, `NEXT_PUBLIC_SUPPORT_BOOKING_URL`.
- [ ] 🧑 (Optional) Hetzner VPS for self-hosted n8n — NOT required (connectors hit the hosted API). Only if you want internal n8n workflows.

### Housekeeping (🤖 code)
- [ ] 🤖 Reconcile CLAUDE.md stale "Starter/Growth/Pro/Enterprise" pricing text → Solo/Core/Edge/Prime/Infinite.
- [ ] 🤖 Delete stale "resolve to a real URL in Week 4" comment in app/api/webhooks/whatsapp/route.ts.
- [ ] 🤖 (Consider) add `deleted_at` + cascade for the 9 analytics/audit tables without it (bot_outcomes, opt_out_log, api_request_log, support logs, etc.) for fuller GDPR erasure — currently retained.

---

## 🎯 Critical path (gates everything; do in this order)
1. Meta Business Verification (Monday).
2. Marketing site live at xyrachat.com + counsel sign-off.
3. Finish domain switch (env + Supabase URLs).
4. Stripe live + `XYRA_OPERATOR_ORG_ID` + backfill.
5. Apply migration 064 + verify PITR + pg_cron.
6. Set Upstash env.
7. Stand up staging → run §15 probe → green.
8. Submit both Meta App Reviews → then work Phase 2 in parallel.
