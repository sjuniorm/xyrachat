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

## 3) 🧑 Stripe go-live  ← FULL REFERENCE (prices confirmed 2026-06-16)
> Deferred until the SL (Mll Nexus Group SL) clears — LIVE mode needs account
> activation (business + bank). Sandbox/test mode works now without the SL.
> Test↔live are isolated: each product has a **"Copy to live mode"** button that
> brings the product + its prices over, but the copied live prices get NEW
> `price_…` ids → re-grab + swap the env VALUES (names below are stable). Keys +
> webhook are per-mode too. (See _docs/stripe walkthrough or ask Claude.)

**3a. API keys** (Developers → API keys): `STRIPE_SECRET_KEY` = `sk_…`;
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_…`.

**3b. The 5 packs** — one product each, Monthly + Yearly EUR price (annual = 2
months free = monthly×10). Copy each price's `price_…` id into the env:

| Pack | Monthly | Yearly | Monthly env | Yearly env |
|---|---|---|---|---|
| Solo | €29 | €290 | `STRIPE_PRICE_SOLO_MONTHLY` | `STRIPE_PRICE_SOLO_YEARLY` |
| Core | €49 | €490 | `STRIPE_PRICE_CORE_MONTHLY` | `STRIPE_PRICE_CORE_YEARLY` |
| Edge ("Most popular") | €99 | €990 | `STRIPE_PRICE_EDGE_MONTHLY` | `STRIPE_PRICE_EDGE_YEARLY` |
| Prime | €199 | €1990 | `STRIPE_PRICE_PRIME_MONTHLY` | `STRIPE_PRICE_PRIME_YEARLY` |
| Infinite | €399 | €3990 | `STRIPE_PRICE_INFINITE_MONTHLY` | `STRIPE_PRICE_INFINITE_YEARLY` |

(Create the Infinite price even if marketed "Contact us" — launch-check expects it.)

**3c. The 6 add-ons** (Edge/Prime only, monthly; the "extra X" ones are per-UNIT —
price one unit, quantity is set per purchase):

| Add-on | Price | Env |
|---|---|---|
| Extra user | €10 | `STRIPE_PRICE_ADDON_EXTRA_USERS_MONTHLY` |
| Extra channel | €15 | `STRIPE_PRICE_ADDON_EXTRA_CHANNELS_MONTHLY` |
| Extra chatbot | €25 | `STRIPE_PRICE_ADDON_EXTRA_CHATBOTS_MONTHLY` |
| +500k AI tokens | €19 | `STRIPE_PRICE_ADDON_EXTRA_AI_TOKENS_MONTHLY` |
| Integrations (Make/Zapier/n8n) | €29 | `STRIPE_PRICE_ADDON_INTEGRATIONS_MONTHLY` |
| Broadcasts | €29 | `STRIPE_PRICE_ADDON_BROADCASTS_MONTHLY` |

**3d. Webhook** → endpoint `https://xyra-chat.vercel.app/api/webhooks/stripe`,
events: `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `customer.subscription.trial_will_end`,
`invoice.paid`, `invoice.payment_failed`, `charge.dispute.created`,
`charge.dispute.updated`, `charge.dispute.closed`. Signing secret → `STRIPE_WEBHOOK_SECRET`.

**3e. Promo** (no copy button) — create a `LAUNCH40` Promotion Code (40% off,
duration **repeating 3 months**), or seed `LAUNCH40` via `/settings/admin/promos`.

**3f. Redeploy**, then **backfill**: `/settings/admin/entitlements` → backfill
un-provisioned orgs → Trial (needs `XYRA_OPERATOR_ORG_ID` set, §4).

**3g. Verify** (do in TEST mode FIRST — this is the add-on flow's test-pass):
checkout into Edge with card `4242 4242 4242 4242`; then buy an "Extra user"
add-on on `/settings/billing` and confirm the team limit rises. Then repeat 3a–3f
in LIVE mode (Copy-to-live the products, swap to `sk_live`/`pk_live`/live price
ids/live `whsec_`).

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

## 6b) 🧑 Calendar — Google (for launch)
Outlook/Microsoft 365 is DONE + connected (env set, app registered). **Google
Calendar is deferred to launch** (founder's call 2026-06-16):
1. Google Cloud Console → enable **Google Calendar API**.
2. OAuth consent screen (External) → add scopes `calendar.freebusy` +
   `calendar.events` → add test users. ⚠️ These are "sensitive" scopes → submit
   for **verification** (scope justification + demo video) before non-test users
   can connect; in "Testing" status refresh tokens expire after 7 days.
3. Credentials → OAuth client ID (Web) → redirect URI
   `https://xyra-chat.vercel.app/api/auth/google-calendar/callback`.
4. Vercel env: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` → redeploy. The
   "Connect Google Calendar" button then auto-appears on `/settings/calendar`.
- ⚠️ Microsoft client secret expires in ≤24 months → set a reminder ~1 month
  prior to rotate (new secret in Entra → update `MICROSOFT_CLIENT_SECRET` →
  redeploy). On expiry the Outlook connection shows "Reconnect needed."

## 6c) 🧑 CRM — HubSpot (deferred; chat leads → CRM)
Code shipped (migration 060 + lib/crm/*). Off until configured:
1. developers.hubspot.com → create a **public app** (not private).
2. App → Auth tab → copy Client ID + Secret → Vercel env `HUBSPOT_CLIENT_ID` /
   `HUBSPOT_CLIENT_SECRET`. Add redirect URL
   `https://xyra-chat.vercel.app/api/auth/hubspot/callback` (+ localhost). Add
   scopes `crm.objects.contacts.read` + `crm.objects.contacts.write`.
3. Redeploy → the "Connect HubSpot" button appears on `/settings/crm`. Once a
   client connects, leads the bot captures auto-sync into their HubSpot.
- Pipedrive / Salesforce: same facade, not built yet (slot in later).

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
