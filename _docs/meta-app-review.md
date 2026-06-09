# Xyra Chat — Meta App Review submission package

> Generated 2026-06-09. Per-permission justification text, screencast scripts, and
> reviewer test instructions for the three Meta channels (WhatsApp, Instagram,
> Messenger), plus a shared Business-Verification / Data-Use / reviewer-access
> section. Every claim here was grounded in the actual codebase and adversarially
> verified — do not soften it into vagueness, but do not add capabilities the code
> doesn't have (overclaiming is the #1 rejection cause).
>
> **App entity:** Xyra Chat · **Operating company:** Mll Studio · **Legal entity:** Mll Nexus Group SL
> **Review URL:** https://xyra-chat.vercel.app (keep review here; defer app.xyrachat.com until after approval)

## ⛔ Fix these BEFORE submitting (verified gaps)

These were caught during review and block a clean submission:

1. ✅ **DONE (2026-06-09).** /privacy + /terms now name **Mll Nexus Group SL (trading as Mll Studio)**
   with the registered address (Calle Poetas Españoles 1, Local 1, 38678 Armeñime, Santa Cruz de
   Tenerife, Spain), governing law = Spain, and no remaining bracket placeholders. This must match the
   Business Verification filing exactly (same legal name + address). *Counsel review still advisable
   (consumer venue, DPO) but not a Meta blocker.*
2. **Instagram `comments` webhook field is NOT auto-subscribed.** `subscribeIgWebhooks()` requests
   only `messages,messaging_postbacks,message_reactions,messaging_referral`. To demo
   `instagram_business_manage_comments`, the operator must enable the `comments` field in
   Meta App Dashboard → Webhooks → Instagram and verify it (see the Instagram operator pre-check).
3. **Confirm the 30-day retention purge cron is ENABLED in production** before asserting it to Meta
   (migration 027 pg_cron + `http` extension + `app_config` cron secret). Don't describe an automated
   control the live deployment doesn't actually run.
4. **Set `INSTAGRAM_APP_SECRET` (and `INSTAGRAM_APP_ID`) in production.** The IG webhook HMAC falls
   back to `META_APP_SECRET` when unset — the wrong secret for the IG app — and the one-click
   "Continue with Instagram" button won't render without `INSTAGRAM_APP_ID`.

**Permission set to request (final):**
- WhatsApp: `whatsapp_business_messaging`, `whatsapp_business_management`
- Instagram: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`
- Messenger: `pages_messaging`, `pages_manage_metadata` — **NOT** `pages_show_list` (never called)

---

## Shared (Business Verification + Data Use + Reviewer access)

> This section is common to all three Meta channel submissions (Instagram DM, WhatsApp, Messenger). Complete everything here **before** submitting any individual permission for App Review. App entity: **Xyra Chat**. Operating company: **Mll Studio**, legal entity **Mll Nexus Group SL**. Product URL: `https://xyra-chat.vercel.app` (custom domain `app.xyrachat.com` is a post-approval switch — see §8). Marketing site: `https://xyrachat.com`.

### 1. Business Verification — Mll Nexus Group SL

Business Verification is the longest-pole external dependency. Start it first; the document review can take several business days and blocks every advanced-access permission below.

1. **Confirm the Business Portfolio.** Sign in at `business.facebook.com` with the admin account that owns the existing Business Portfolio (`1612917756584806`). Confirm **both** Meta apps are attached to this portfolio: the original WhatsApp + Messenger app (App ID `4417258865176192`) and the Instagram-specific **Xyra Chat-IG** app.
2. **Set the legal business name exactly.** Business Settings → Business Info → set the legal name to **Mll Nexus Group SL** (the registered company name), with the registered address and country of incorporation. This string must match the registration documents character-for-character — a mismatch is the single most common verification rejection.
3. **Add a verifiable business email.** Use an email on the `xyrachat.com` domain (e.g. `legal@xyrachat.com` or `support@xyrachat.com`), not a personal/free-mail address. Meta sends a confirmation code to this address during verification.
4. **Confirm the website.** Set the business website to `https://xyrachat.com`. The domain WHOIS / registrar records should be consistent with Mll Nexus Group SL (or, where WHOIS privacy is enabled, be ready to show registrar control via DNS TXT). The site must be live, describe the business, and link to the Privacy Policy and Terms.
5. **Open Security Center.** Business Settings → **Security Center** → start **Business Verification**.
6. **Upload the legal documents.** Provide official documents that prove the legal entity and tie it to the business email/phone/address:
   - Certificate of incorporation / company registration extract for **Mll Nexus Group SL** (Spanish *Registro Mercantil* extract or equivalent), showing legal name, registration number, and registered address.
   - A business utility/bank/tax document showing the same legal name + address (if Meta asks for a secondary proof).
   - Tax/VAT identifier (CIF/NIF) where requested.
7. **Verify the phone/email/domain.** Complete the confirmation-code step on the business phone and/or email. Complete **domain verification** for `xyrachat.com` (DNS TXT or meta-tag) so the app's privacy/terms URLs are trusted.
8. **Wait for approval, then proceed.** Only after the portfolio shows **Verified** should you move the individual permissions from Standard/dev access to **Advanced Access** in App Review.

> Pre-flight checklist before clicking submit: legal name = "Mll Nexus Group SL" everywhere · business email on `xyrachat.com` · website live with working `/privacy` + `/terms` · incorporation document ready · domain verified.

### 2. App-level setup (dev-mode → live-mode)

- **Two separate Meta apps, by design.** WhatsApp + Messenger ride the **original** Facebook app (App ID `4417258865176192`); HMAC for both verifies against `META_APP_SECRET`. Instagram DM rides the **Xyra Chat-IG** app; its webhook HMAC verifies against `INSTAGRAM_APP_SECRET` and its OAuth uses `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`. (Set `INSTAGRAM_APP_SECRET` in production — the webhook handler falls back to `META_APP_SECRET` only when it is unset, which would be the wrong secret for the IG app.) Each app is submitted for review independently, but all share this Business Verification.
- **Dev mode (current).** In Development mode only **app roles** (Admins, Developers, Testers) and explicitly added **test users / Instagram Testers** can exercise the integrations. This is the correct state for building and for the reviewer's guided test (see §5). Customer traffic does not flow until the app is in Live mode.
- **What flips on approval.** Each permission is requested at **Advanced Access**. Once a permission is approved AND the app is toggled to **Live**, that channel can receive/send messages for non-test end users:
  - `instagram_business_basic` + `instagram_business_manage_messages` (+ `instagram_business_manage_comments`) → Instagram DM inbound + outbound for connected business accounts, plus comment-keyword automations (see §3 / §6).
  - `whatsapp_business_messaging` + `whatsapp_business_management` → WhatsApp Cloud API send + WhatsApp template create/sync/delete on the WABA.
  - `pages_messaging` (+ `pages_manage_metadata`) → Facebook Messenger inbound + outbound for connected Pages; `pages_manage_metadata` authorizes subscribing the Page to our webhook (`subscribed_apps`) at connect time.
- **Submission order (recommended).**
  1. Complete **Business Verification** (§1) — gates everything.
  2. Submit **WhatsApp** (`whatsapp_business_messaging`, `whatsapp_business_management`) — it has zero dev-mode messaging restrictions on the Cloud API test number, so it's the easiest to demo end-to-end first.
  3. Submit **Instagram** (`instagram_business_basic` → `instagram_business_manage_messages` → `instagram_business_manage_comments`) — request `_basic` (the prerequisite) and `_manage_comments` alongside the messaging permission, because the OAuth dialog (Continue-with-Instagram) requests all three scopes; a mismatch between the dialog scopes and the review submission is a rejection trigger.
  4. Submit **Messenger** (`pages_messaging` **+ `pages_manage_metadata`**). The connect action calls `POST /{page_id}/subscribed_apps`, which requires `pages_manage_metadata`, so it IS exercised — request it. **Do NOT request `pages_show_list`** — the connect is manual Page-token entry (no Page picker), so it is unused and requesting it invites a "permission not justified" rejection.
  5. Switch the app(s) to **Live** only after the relevant permission is approved.
- **App settings hygiene before submit:** valid Privacy Policy URL (`https://xyra-chat.vercel.app/privacy`), Terms URL (`/terms`), app icon, category, and a Data Deletion instructions URL (point at `/privacy` deletion section or the GDPR endpoints described in §3). Verify the webhook callback URLs resolve and pass the GET handshake for each product.

### 3. Data Use Checkup

Meta's Data Use Checkup asks you to attest, per permission, what data you collect and why. Answer these grounded in the schema and the privacy page — do **not** claim any use beyond messaging operations.

**Role & lawful basis.** Xyra Chat is a **data processor**; the business customer (the org that connects its own WhatsApp/Instagram/Messenger assets) is the **controller**. Lawful bases: performance of contract (delivering the inbox service), legitimate interest (security / abuse prevention), explicit consent (non-essential cookies), legal obligation. Data is hosted in the **EU** (Supabase) for GDPR alignment.

**Permission → code-backed justification:**

| Permission | What it does in the app | Code |
|---|---|---|
| `instagram_business_basic` | Prerequisite for IG messaging; reads the connected IG business account's id/username/profile during the Continue-with-Instagram OAuth so we can identify the channel. | `app/api/auth/instagram/start` + `/callback` (Instagram Business Login) |
| `instagram_business_manage_messages` | Receive inbound IG DMs into the unified inbox and send agent replies. | `app/api/webhooks/instagram/route.ts` (inbound + HMAC); `/api/v1/messages` + composer → `/api/channels/instagram/send` (outbound) |
| `instagram_business_manage_comments` | Resolve IG comments to contacts so comment-keyword automations can DM the commenter (Week 10 `ig_comment_keyword` trigger). | `app/api/webhooks/instagram/route.ts` (`entry.changes` comments → `lib/automations/triggers.ts`) |
| `whatsapp_business_messaging` | Send WhatsApp text/template/image and receive inbound + delivery receipts. | `app/api/v1/messages/route.ts`, `/api/channels/whatsapp/send`, `app/api/webhooks/whatsapp/route.ts` |
| `whatsapp_business_management` | Create / sync / delete WhatsApp **message templates** on the WABA (the `/templates` UI). | `lib/templates/actions.ts` → `POST/GET/DELETE graph.facebook.com/{wa_business_account_id}/message_templates` |
| `pages_messaging` | Receive inbound Messenger DMs and send agent replies; subscribe the Page to the app webhook at connect time. | `app/api/webhooks/messenger/route.ts`; connect action `POST {page_id}/subscribed_apps`; `/api/channels/messenger/send` |

> **WhatsApp webhook registration is manual**, not API-driven: the connect screen (`/settings/channels/new`) *displays* the Callback URL + Verify token for the user to paste into the Meta dashboard. `whatsapp_business_management` is justified by **template management on the WABA**, not by registering webhooks.

**What is collected/stored via the Meta permissions, and why:**

| Data category | Stored where | Purpose |
|---|---|---|
| Inbound + outbound message content (text, attachments) | `messages` table (soft-deleted, org-scoped via RLS) | Render the unified inbox so agents can read history and reply |
| Customer contact identifiers — `instagram_id`, `messenger_id` (PSID), phone, email, name, profile photo | `contacts` table | Route messages to the correct conversation and address the customer |
| Conversation metadata — status, assignment, tags, internal notes | `conversations` table | Team triage / assignment / support workflow |
| Channel credentials | **Supabase Vault** (only the vault UUID is stored on `channels.access_token_vault_id`) | Authenticate Graph/Cloud API calls for that one channel |
| Delivery/read receipts, message IDs (`wa_message_id`, `ig_message_id`, `messenger_message_id`) | `messages` | Status tracking + **idempotency** (partial unique indexes prevent duplicate storage) |
| Account data — name, email, hashed password, role, org | `profiles` / `organizations` | Authentication + team roles |
| Billing reference | `subscriptions` (Stripe customer ID only — **never** raw card data) | Subscription management |
| Product analytics | PostHog (EU host) — **feature events only, never message content; session recording disabled** | Usage metrics |

**Explicitly NOT done:** message content is never sent to analytics; nothing is sold; data is not used to build advertising profiles. AI features are **optional and customer-controlled** (per-channel toggle via the bot gate); when enabled, content is sent to Anthropic / OpenAI **for inference only**, and per those providers' API terms that data is **not used to train their models**.

**Tenant isolation.** Every table is scoped per-organization by **Row Level Security** (Supabase Postgres) — a query can only see rows for the caller's org. Channel tokens are vault-encrypted, limiting the blast radius of a compromised key. Data is encrypted in transit (HTTPS) and at rest.

**Retention & deletion (GDPR rights):**
- **Soft-delete only** — every PII-bearing table carries `deleted_at`; RLS filters `deleted_at IS NULL` so deleted rows are immediately invisible.
- **Right of access** — `GET /api/gdpr/export` returns a JSON export of the user/org data.
- **Right to erasure** — `POST /api/gdpr/delete` soft-deletes the user + org cascade.
- **Retention window** — on cancellation, org data is retained up to **30 days**, then purged by the scheduled job (`soft_delete_org()` + `trigger_retention_purge()` pg_cron job in migration 027, dispatched via `/api/internal/retention-purge`). **The code is shipped; before asserting this control to Meta, the operator must confirm the cron is ENABLED in production** (pg_cron + the `http` extension + the `app_config` cron secret per the launch runbook). If it is not yet enabled in prod, enable it before submission rather than describing automation the live deployment doesn't run.
- **Sub-processor transparency** — the Privacy Policy lists every sub-processor (below).

**Sub-processors (must be listed in the Privacy Policy):** Supabase (database / auth / storage), Vercel (hosting), Anthropic (optional AI replies), OpenAI (optional embeddings), Stripe (billing), Resend (transactional + email channel), Meta Platforms (WhatsApp / Instagram / Messenger), Telegram (Telegram channel), PostHog (EU analytics).

### 4. Privacy-policy & Terms alignment

Confirm `/privacy` and `/terms` cover the Meta-relevant items below, and **fix the listed gaps before submitting** (a privacy policy that contradicts the app, or contains unfilled placeholders, is a hard rejection).

**`/privacy` must state:**
- That Xyra Chat stores customer **messaging data** received via WhatsApp, Instagram, and Messenger on behalf of the business customer (processor relationship).
- The full **sub-processor list** (§3), including Meta Platforms and the AI providers, with the explicit "AI providers do not train on API data" statement.
- **International transfers** posture (EU-hosted primary; transfers to sub-processors under appropriate safeguards).
- **Retention** (soft-delete + 30-day post-cancellation purge) and the **GDPR access/erasure endpoints** + a data-deletion instructions path Meta can cite.
- **Cookies / analytics** (PostHog EU, feature events only, session recording disabled; EU cookie consent).

**`/terms` must state:**
- **Acceptable use** for the connected channels (no spam, comply with WhatsApp/Instagram/Messenger platform policies), and the right to suspend abusive use.
- The **opt-out mechanism** (STOP/START handling) and that the business customer is the **controller** responsible for having a lawful basis to message its contacts.
- A **Data Processing Addendum** framework for business customers.

**Gaps to fix before submission (from review):**
- **Legal-entity name mismatch — MUST FIX.** Privacy/Terms currently reference "Mll Studio". Update to the registered legal entity **Mll Nexus Group SL** (and registered address / jurisdiction / venue) so the policy matches Business Verification exactly.
- **Unfilled bracket placeholders — MUST FIX.** Any remaining `[legal entity name + registered address]`, `[jurisdiction]`, `[venue]` placeholders must be filled before the URLs are shown to Meta.
- **30-day purge job — confirm it is ENABLED in production before claiming it.** The job is implemented in code (migration 027 `retention_purge` cron + `/api/internal/retention-purge`). Verify pg_cron + the `http` extension + the `app_config` cron secret are active in prod so the schedule actually fires; if not yet enabled, enable it before submission. Do not assert an automated control the live deployment doesn't run.

### 5. Reviewer login & test access

Meta's reviewer must be able to sign into the **live app** and exercise the full inbound→inbox→reply loop for each channel. Provide the following in the App Review "Instructions for reviewer" + screencast.

**A. Reviewer account into Xyra Chat (pick one):**
1. **Pre-made test org (preferred).** Seed a dedicated reviewer org with: a **confirmed** login (email + password supplied in the submission notes), one connected channel **per** submitted permission, and a few seeded conversations so the inbox isn't empty on first load. Hand the reviewer the credentials directly so they skip signup/email-confirmation friction.
2. **Self-signup fallback.** If self-signup is required: `https://xyra-chat.vercel.app` → **Get started** → signup (name / work email / password ≥ 8 chars) → **confirm email via the link Supabase sends** → sign in → onboarding (org name) → `/dashboard`. (Email confirmation is required by the Supabase project, so the pre-made confirmed login above avoids the reviewer getting stuck here.)

**B. Connect the channel under test (dev-mode reality).** Because the app is in Development during review, the channel must be connected to a Meta **test asset** and messaged from a **test user / Instagram Tester**:
- **Instagram:** add the Instagram account as an **Instagram Tester** (and have it accept the invite at `instagram.com/accounts/manage_access/`); connect it in Xyra Chat via `/settings/channels` → Add channel → **Instagram DM** → **Continue with Instagram** (Instagram Business Login — NOT Facebook Login; the OAuth dialog requests `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`). A manual fallback (IG Business Account ID + recipient ID + token) exists if `INSTAGRAM_APP_ID` is unset.
- **WhatsApp:** use the Meta-provided **Cloud API test number**; connect via `/settings/channels` → Add channel → **WhatsApp** (paste Phone Number ID + WABA ID + token; copy the **displayed** Callback URL + Verify token into the Meta dashboard webhook config — this step is manual by design).
- **Messenger:** add the reviewer's test user as a **role** on the Page; connect via `/settings/channels` → Add channel → **Messenger** by pasting the **Page ID + Page access token** (manual entry — there is no Page picker). On save, the connect action calls `POST {page_id}/subscribed_apps`, which both validates the token and subscribes the Page to the webhook.

**C. The loop the reviewer performs (and the screencast must show):**
1. From the **test user's** Instagram/WhatsApp/Messenger, send a message to the connected business asset.
2. Show the message appearing as a new conversation in the unified inbox (`/inbox` → `/inbox/[id]`), with the contact identified by its `instagram_id` / phone / `messenger_id` from the webhook payload.
3. Type and **Send** a reply from the agent composer (composer routes to `/api/channels/{instagram,whatsapp,messenger}/send`).
4. Show the reply arriving back on the test user's device, and the status advancing `sent → delivered → read` as receipts arrive.
5. Optionally show **team collaboration** (`/settings/team` → invite an Agent) and the **opt-out** behavior to evidence acceptable-use controls.
6. *(If demoing the public API)* Show a send via `POST /api/v1/messages` with `{ "conversation_id": "<id>", "content": "hi", "type": "text" }` and a `Bearer` API key — this is the send endpoint; `/api/v1/conversations/{id}/messages` is **read-only (GET)**.

**D. Always include a screencast.** Dev-mode messaging restrictions mean the reviewer may not be able to reproduce inbound traffic on a brand-new account. A pre-recorded, narrated walkthrough of the full loop per channel — plus the seeded test org and clearly listed test-tester accounts — is the single highest-leverage thing to avoid a "could not verify" rejection.

### 6. Common rejection reasons & pre-emptions (all channels)

| Risk | Pre-emption |
|---|---|
| **Reviewer can't reproduce inbound DMs (dev-mode limits)** | Seeded test org + listed test-tester accounts + a narrated screencast showing the full inbound→inbox→reply loop per channel (§5). Point to `app/api/webhooks/{instagram,whatsapp,messenger}/route.ts` storing the contact by its platform identifier (`instagram_id` / phone / `messenger_id`), with RLS enforcing org isolation. |
| **OAuth dialog scopes ≠ submitted permissions (Instagram)** | The Continue-with-Instagram dialog requests `instagram_business_basic`, `instagram_business_manage_messages`, AND `instagram_business_manage_comments`. Submit all three; `_manage_comments` is justified by the IG comment-keyword automation (`lib/automations/triggers.ts`). |
| **Unused permission requested (Messenger)** | Connect is manual Page-token entry (no Page picker). Request `pages_messaging` **+ `pages_manage_metadata`** (the latter is genuinely used: the connect action calls `POST /{page_id}/subscribed_apps`). Do **NOT** request `pages_show_list` — it is never called. |
| **WhatsApp management permission unjustified** | `whatsapp_business_management` is exercised by template create/sync/delete on the WABA (`lib/templates/actions.ts` → `{wa_business_account_id}/message_templates`), surfaced in the `/templates` UI. Webhook registration is manual (dashboard), not via this permission. |
| **Unclear spam/abuse prevention** | Ground Terms §acceptable-use in real code: opt-out STOP/START handling (`lib/contacts/opt-out.ts`, `applyOptOutAction` wired in the WA webhook), API rate limiting (`POST /api/v1/messages` — Upstash, 120/60s per org; per-key v1 limits in `lib/api/handler.ts`), webhook HMAC signature verification on every inbound, and vault-scoped per-channel tokens. |
| **GDPR claims not tied to code** | Point to `deleted_at` + `deleted_at IS NULL` RLS on all message tables (migration 003), `GET /api/gdpr/export`, `POST /api/gdpr/delete`, the 30-day purge job (migration 027 — confirm it's ENABLED in prod, §4), and the DPA framework in Terms. |
| **AI/data-training concern** | Privacy §AI: Anthropic + OpenAI do not train on API data; AI is optional + per-channel toggle (bot gate). Have provider ToS excerpts ready if asked. |
| **Webhook replay → duplicate messages** | Highlight idempotency: HMAC verify before processing + **partial unique indexes** `idx_messages_wa_unique` / `idx_messages_ig_unique` (migration 003) / `idx_messages_fb_unique` on `messenger_message_id` (migration 046), each `WHERE <id> IS NOT NULL` → at-most-once storage across all rows + `webhook_log` audit trail. |
| **Legal-entity name mismatch** | Make "Mll Nexus Group SL" consistent across Business Verification, `/privacy`, and `/terms`; fill all bracket placeholders (§4). |
| **Privacy/Terms URL unreachable or generic** | Confirm `/privacy` + `/terms` resolve on the production URL, cover messaging data + every sub-processor, and contain no placeholders before submit. |
| **Production URL vs custom domain mismatch** | Keep review on `https://xyra-chat.vercel.app`. Defer the `app.xyrachat.com` switch until **after** approval; the switch then requires updating Supabase Auth redirect URLs + all Meta webhook callback URLs + a full re-test (do not switch mid-review). |
| **Permission not justified by visible feature** | Each permission maps to a user-facing surface: channel connect (`/settings/channels/{instagram,whatsapp,messenger}/new` — Continue-with-Instagram for IG, manual paste for WA/Messenger), inbox read/reply (`/inbox/[id]`), templates (`/templates`, for `whatsapp_business_management`), and the send routes (`/api/channels/*/send`, `POST /api/v1/messages`). Demo each in the screencast. |

---

## WhatsApp

### Permissions requested

**`whatsapp_business_messaging`**

We use this permission to power the WhatsApp side of our unified team inbox. When a customer messages a connected WhatsApp Business number, Meta delivers the event to our webhook (`/api/webhooks/whatsapp`), where we verify the `x-hub-signature-256` HMAC signature against the app secret before any processing, then store the message (text, or the caption/filename plus Meta media ID for image, document, audio, and video) against an org-scoped conversation. Agents read these inbound messages in the unified inbox (`/inbox`) and reply with free-form text through the Meta Cloud API (`POST /{phone_number_id}/messages`) only after an agent explicitly sends them. Meta's 24-hour customer-service window governs when free-form text is deliverable; outside that window WhatsApp requires a pre-approved template, which we send as part of an audience-filtered broadcast (see `whatsapp_business_management`). We never message a contact who has opted out — every inbound text message is screened for STOP/START keywords (`lib/contacts/opt-out.ts`) before any reply or bot response is generated.

**`whatsapp_business_management`**

We use this permission to let organization owners and admins create, edit, and manage WhatsApp message templates without leaving Xyra Chat. In our `/templates` builder, an admin assembles a template's header, body, footer, and button components with example values, then submits it to Meta for review via `POST /{wa_business_account_id}/message_templates` (Graph API v22.0; `lib/templates/actions.ts` → `createTemplate`). Edits to an approved template are resubmitted via `POST /{template_id}` (`editTemplate`), and we periodically pull each template's current status — `PENDING` / `APPROVED` / `REJECTED` (with the rejection reason) — back into our local mirror via `GET /{wa_business_account_id}/message_templates` (`syncTemplates`) so admins see live status on each template card. Only templates Meta has marked `APPROVED` can be sent in a broadcast (`app/api/broadcasts/send/route.ts` refuses any template whose `meta_status` is not `APPROVED`). We do not bypass Meta's review — templates are unusable for sending until Meta approves them.

### Screencast script

Total runtime target: ≤ 2:45. Every beat below is reproducible in the live app exactly as shown.

1. **00:00** — Screen: Xyra Chat dashboard at `/settings/channels`. Narration: "This is Xyra Chat, a unified inbox for customer messaging. I'll connect a WhatsApp Business number."
2. **00:08** — Click "Add channel" → select "WhatsApp Business" from the dropdown. Lands on `/settings/channels/new`. Narration: "I add a channel and choose WhatsApp Business."
3. **00:18** — Show the "Callback URL" and "Verify token" fields on the page (each with a copy button); cut to the Meta App Dashboard (WhatsApp → Configuration → Webhook) with those values pasted, click "Verify and save". Narration: "I paste our callback URL and verify token into Meta and confirm the subscription."
4. **00:35** — Back in Xyra Chat, paste the Phone Number ID (and optionally the WhatsApp Business Account ID) and the access token into the form, click submit. Narration: "Then I enter the Phone Number ID and access token, which we encrypt in Supabase Vault."
5. **00:45** — `/settings/channels` shows the new channel with an "Active" badge. Narration: "The channel is now connected and active."
6. **00:55** — Switch to a real phone; send a WhatsApp message ("Hi, is anyone there?") to the connected number. Narration: "From a customer's phone, I send an inbound message."
7. **01:08** — Screen: Xyra Chat unified inbox (`/inbox`); the new conversation and inbound message appear in real time. Narration: "It arrives instantly in the unified inbox — this uses whatsapp_business_messaging to receive inbound messages."
8. **01:22** — Open the conversation, type a reply in the composer, click send; the outbound bubble appears, then confirm receipt on the phone. Narration: "Within the 24-hour window the agent replies with free-form text, and it's delivered to the customer."
9. **01:40** — From the phone, send "STOP"; in the inbox the contact is marked opted-out and an automatic confirmation reply is sent to the phone. Narration: "If a customer sends STOP, we mark them opted out and send a confirmation — they won't be messaged again."
10. **01:55** — Screen: `/templates`; click "New template", select the WhatsApp channel, build a template (header / body / footer / button) with example values, submit. Narration: "Now an admin creates a message template — this uses whatsapp_business_management."
11. **02:18** — Show the new template card with a PENDING status badge, then a previously approved template showing an APPROVED badge. Narration: "We submit it to Meta for review and show its live approval status."
12. **02:30** — Screen: `/broadcasts/new`; create a broadcast with the approved template; the audience step shows the eligible count with opted-out contacts excluded, then click through and "Launch now". Narration: "Once approved, the template is sent in a broadcast — and opted-out contacts are always excluded." End at ~02:45.

> Note: free-form text replies are sent from the inbox composer; pre-approved **templates** are sent from the **Broadcasts** flow, not from the inbox composer. The screencast reflects this (text reply in step 8, template send via broadcast in step 12).

### Reviewer test instructions

1. Navigate to the app: `https://xyra-chat.vercel.app` (or `https://app.xyrachat.com` after the custom-domain switch — **operator: confirm which URL is live and supply the exact one here**).
2. Sign in with the reviewer test account — **operator: fill in test email + password** (e.g. `reviewer@xyrachat.com` / `<password>`). Create this account in advance, complete onboarding so it has an organization, and confirm it has **owner or admin** role (required to connect channels and create templates).
3. Go to **Settings → Channels** (`/settings/channels`). A WhatsApp channel is **already connected** and shows an **Active** badge, so no live Meta credentials are needed during review. (**Operator: pre-connect the sandbox/test WABA before submitting.**) To see the connect UI itself, click "Add channel" → "WhatsApp Business" to view `/settings/channels/new` (the Callback URL, Verify token, Phone Number ID, optional WhatsApp Business Account ID, and Access token fields).
4. To see inbound messaging: from any WhatsApp phone, send a message to the connected test number — **operator: provide the test WhatsApp number here** (e.g. `+1 555 000 0000`). The message appears in the **Inbox** (`/inbox`) within a few seconds (uses `whatsapp_business_messaging`).
5. Open that conversation and type a free-form reply in the composer, then send. The reply is delivered to the phone (uses `whatsapp_business_messaging`). Note: free-form text is deliverable only within Meta's 24-hour window; if the window has closed, WhatsApp/Meta will reject the free-form send and the customer must be re-engaged with a template via Broadcasts.
6. Test opt-out: send `STOP` from the phone. The contact is flagged opted-out and an automatic confirmation reply is sent to the phone; no bot reply follows.
7. To see template management: go to **Templates** (`/templates`) → **New template** → choose the WhatsApp channel → build header / body / footer / button with example values → submit. The card shows a **PENDING** status that updates after Meta review (uses `whatsapp_business_management`). A pre-approved template is also present so reviewers can see the **APPROVED** state immediately. (**Operator: pre-create one approved template.**)
8. To see a template in use: go to **Broadcasts → New** (`/broadcasts/new`), select the approved template, and observe that the audience step shows the **eligible recipient count with opted-out contacts excluded** before launch. Click "Launch now" to send the approved template to eligible contacts.

### Data handling

Inbound WhatsApp messages are delivered by Meta to our `/api/webhooks/whatsapp` endpoint, where we verify the `x-hub-signature-256` HMAC signature (constant-time comparison against the app secret) before any processing — invalid signatures are rejected with HTTP 401 and never parsed. Message content is stored in our `messages` and `conversations` tables; contact phone numbers and names are stored in the `contacts` table. For inbound media (image / document / audio / video) we currently store the Meta media ID and media type, not the binary or a resolved media URL (URL resolution is deferred — see below). All records are organization-scoped and protected by Postgres Row-Level Security, so one customer's data is never readable by another organization. WhatsApp access tokens are encrypted in Supabase Vault — only the Vault secret's UUID is stored in our `channels` table, never the token itself. Opt-out state is recorded on `contacts.opted_out` with a full audit trail in `opt_out_log`; the broadcast send flow filters to contacts where `phone` is present and `opted_out = false` at send time, so opt-outs are always honored regardless of how the audience was defined. Message templates and broadcast metadata are stored locally and synced with Meta via Graph API v22.0. Data is retained for the lifetime of the organization's account and removed on account deletion via our soft-delete / erasure flow.

### Rejection risks & mitigations

- **STOP/START detection could appear too permissive.** Our classifier (`lib/contacts/opt-out.ts:classifyOptOut`) uses strict matching on inbound **text** — the content is trimmed, lowercased, and stripped of a single trailing punctuation mark, then compared by exact equality against the keyword set. So "STOP" unsubscribes but "if you stop the car" does not. It covers 14+ keywords across EN/ES/FR/PT/DE/NL. Detection runs on every inbound text message before any bot or agent reply, and an unsubscribe short-circuits the bot gate. We document this design explicitly for reviewers.
- **Send-endpoint rate limiting is per-user and provisioning-dependent.** The interactive send route is wired to limit 120 messages / 60s per user (`app/api/channels/whatsapp/send/route.ts`), and broadcast launches are throttled at 10 / 600s per org (`app/api/broadcasts/send/route.ts`). These limits are enforced by an Upstash Redis sliding window and, by design, **fail open until `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are provisioned** (`lib/rate-limit.ts`). The operator provisions Upstash before production launch so these limits are active. For high-volume production senders we will additionally align throttling to per-WABA limits via a queue-based worker (broadcasts already pace sends at ~67/sec under Meta's ~80/sec per-WABA ceiling).
- **Inbound media URL resolution is deferred.** We store Meta media IDs and the media type but do not yet fetch the media binary/URL from the Graph API (explicitly noted in `app/api/webhooks/whatsapp/route.ts`). Media is therefore not rendered to agents until resolution is implemented; this is on the roadmap and will be completed before broad production use. No third-party media URLs are exposed in the interim.
- **Re-sending a completed broadcast.** The send endpoint claims a broadcast atomically — it only transitions a row from `draft` / `scheduled` / `failed` → `sending` via a guarded conditional UPDATE, so a `done` or `cancelled` broadcast can never be re-launched through the normal flow (`app/api/broadcasts/send/route.ts`, the `.in("status", ["draft","scheduled","failed"])` claim). A `UNIQUE(broadcast_id, contact_id)` index additionally prevents re-queueing the same contact. The `/broadcasts` UI shows persistent status badges.
- **Audience definition could appear to bypass opt-out.** Opt-out is enforced server-side at send time, not at audience-definition time: the send flow re-resolves the audience at launch and filters eligible recipients with `c.phone && !c.opted_out` (`app/api/broadcasts/send/route.ts`), so an opted-out contact is never messaged even if they match the audience filter and even if they opted out after the broadcast was drafted.
- **24-hour window is enforced by Meta plus a UI affordance, not by our backend.** The WhatsApp send route does not itself block out-of-window free-form text; Meta's API rejects it, and our inbox shows a "Template only" indicator (`components/inbox/whatsapp-window-timer.tsx`) once the window has closed so agents know to re-engage with a template via Broadcasts. We describe this honestly rather than claiming server-side window enforcement.

---

## Instagram

### Permissions requested

**`instagram_business_basic`**

We request `instagram_business_basic` to identify the Instagram Business account that the user connects to Xyra Chat during our Instagram Business Login OAuth flow. In the OAuth callback (`app/api/auth/instagram/callback/route.ts`), after exchanging the authorization code for a long-lived access token, we call `graph.instagram.com/v22.0/me?fields=id,username,profile_picture_url` to read the account's Instagram user ID, username, and profile picture (`fetchIgProfile`, lines 217–232). We store exactly these three fields as channel metadata so the connected account is correctly labeled in the workspace and shown in our Channels settings list (`/settings/channels`). The user ID is the identifier we use to associate inbound Direct Messages with the right connected channel. We do not read media, insights, follower lists, or any data beyond these three fields, and we use them only to set up and label the channel.

**`instagram_business_manage_messages`**

We request `instagram_business_manage_messages` to power the core function of Xyra Chat: a unified inbox for the connected Instagram Business account. Inbound Direct Messages are delivered to our Meta webhook (`app/api/webhooks/instagram/route.ts`, `handleInbound`), where we store each message against a conversation in the agent's inbox. A human agent reads the message in our dashboard inbox (`/inbox`) and replies by typing in the message composer and pressing send; that reply is sent back to the customer through the Graph API `POST graph.instagram.com/v22.0/{ig_user_id}/messages` endpoint with `messaging_type: "RESPONSE"`, using the channel's stored access token (`app/api/channels/instagram/send/route.ts`, lines 110–131). This permission is used exclusively to receive customer DMs into the inbox and send the agent's reply back. We do not initiate messages to users who have not first messaged the connected account, and outbound sends respect Instagram's standard 24-hour customer-service messaging window.

**`instagram_business_manage_comments`**

We request `instagram_business_manage_comments` so businesses can respond to comments on their own Instagram posts through Xyra Chat's automation feature. Comment events are delivered to our Meta webhook (`app/api/webhooks/instagram/route.ts`, the `change.field === "comments"` branch, lines 220–244). When a comment matches a keyword the business has configured, it fires an "IG comment keyword" automation rule (`lib/automations/triggers.ts`, `ig_comment_keyword`, lines 59–72), which the business builds in our automation builder (`/automations`; the trigger is offered at `automation-builder.tsx:42`). The configured action then replies to the commenter — typically by sending a follow-up Direct Message, or by tagging/routing the contact for an agent to follow up. We read the comment ID, author ID, author username, comment text, and post ID solely to match the keyword and route the configured response. This permission is used only for the business's own posts and only to deliver the keyword-triggered actions the business has explicitly configured.

> Note on comment-reply delivery: a comment-triggered Direct Message is sent through the same `/messages` `RESPONSE` path as agent replies, so it is subject to Instagram's 24-hour messaging window. Replies to commenters with whom no messaging window is open may not be delivered as a DM; the window-independent actions in the same automation (tag the contact, assign to an agent) always succeed. This is reflected in the screencast and reviewer steps below.

### Screencast script

Total runtime target: ~2:45. Record at the deployed URL `https://xyra-chat.vercel.app`, signed in as a test workspace owner, with a test Instagram Business account ready on a phone or second device. **Use the same test Instagram account for the DM in step 00:52 and the comment in step 02:10** — sending the DM first opens the 24-hour messaging window so the comment-triggered DM reply delivers reliably.

- **00:00** — On screen: Xyra Chat dashboard, `/settings/channels`. Narration: "This is Xyra Chat, a unified customer-messaging inbox. I'll connect an Instagram Business account."
- **00:08** — Click the **Add channel** dropdown (top right), then select **Instagram DM**. Narration: "I add a channel and choose Instagram."
- **00:15** — On the connection page (`/settings/channels/instagram/new`), under the **One-click connect** card, click the gradient **Continue with Instagram** button (white "IG" badge). Narration: "I start the Instagram Business Login flow." (If the button is absent, `INSTAGRAM_APP_ID` is not set — see the operator pre-check.)
- **00:22** — Instagram OAuth dialog (`instagram.com/oauth/authorize`) loads, requesting `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`. Log in and tap **Allow**. Narration: "I grant the three permissions the app requests."
- **00:40** — Redirect lands back on `/settings/channels?connected=instagram`. Point to the new Instagram channel row showing the account username. Narration: "The account is connected and now appears in my channels, labeled with its username — that's the basic profile permission in use."
- **00:52** — Switch to the phone/second device showing the **test Instagram account**. Send a Direct Message to the connected Business account (for example, "Hi, do you have this in stock?"). Narration: "From a customer's Instagram, I send a Direct Message to the business." (This also opens the 24-hour window used by the comment step later.)
- **01:08** — Back in Xyra Chat, open `/inbox`. The new conversation appears in the list; click it to open the thread. Narration: "The message arrives in the unified inbox in real time — this is the manage-messages permission receiving the DM."
- **01:25** — In the open thread, type a reply in the composer (for example, "Yes, we do — would you like me to reserve one?") and click **Send**. Narration: "An agent replies directly from the inbox."
- **01:40** — Switch to the phone showing the Instagram account; show the agent's reply delivered in the Instagram conversation. Narration: "The reply is delivered back through the Graph API into the Instagram conversation."
- **01:58** — Back in Xyra Chat, go to `/automations` and open the pre-built automation whose trigger is **IG comment keyword** (on the Instagram channel), with its keyword configured. Show the trigger and its configured action(s). Narration: "Xyra Chat also lets the business reply to comments on its own posts."
- **02:10** — On the phone, using the **same test Instagram account from step 00:52**, comment on one of the Business account's posts using the configured keyword. Then show the automated reply being delivered to the commenter (DM, because the window from step 00:52 is open) and/or the tag applied to the contact. Narration: "When a comment matches a configured keyword, the automation responds — that's the manage-comments permission."
- **02:32** — Return to the `/automations` detail view showing the run count increment. Narration: "The automation logs the run. That's the full Instagram flow: connect, receive, reply, and comment automation."

### Reviewer test instructions

> Operator: complete the **operator pre-check** below, then fill in the bracketed values before submitting.

1. Go to **`https://xyra-chat.vercel.app`** and sign in with the test reviewer account:
   - Email: **[OPERATOR: test reviewer email]**
   - Password: **[OPERATOR: test reviewer password]**
2. In the left sidebar, open **Settings → Channels** (`/settings/channels`).
3. Click **Add channel** (top right) and select **Instagram DM**.
4. On the connection page, under **One-click connect**, click **Continue with Instagram** and complete the Instagram Business Login flow, granting all three requested permissions. Use the test Instagram Business account:
   - Instagram handle: **[OPERATOR: test IG Business account @handle]**
   - Login: **[OPERATOR: IG account login if the reviewer must authenticate it themselves, otherwise "pre-authorized by operator"]**
5. Confirm the new channel appears in the channel list labeled with the account's username (this exercises `instagram_business_basic`).
6. From a **separate Instagram account (the one you will also comment from in step 8)**, send a Direct Message to the connected Business account: **[OPERATOR: handle to message, e.g. the @handle from step 4]**. (Sending this DM first opens the 24-hour messaging window so the comment-triggered DM reply in step 8 delivers.)
7. In Xyra Chat, open **Inbox** (`/inbox`); the new conversation appears. Open it, type a reply, and click **Send** (this exercises `instagram_business_manage_messages` — inbound receive and outbound reply). Confirm the reply is delivered in the Instagram conversation.
8. To verify `instagram_business_manage_comments`: open **Automations** (`/automations`) and review the pre-built automation using the **IG comment keyword** trigger on the Instagram channel, with keyword **[OPERATOR: configured keyword]**. Using the **same Instagram account as step 6**, comment that keyword on the Business account's post **[OPERATOR: link to test post]**. The automation fires; its configured action (a follow-up DM and/or a tag on the contact) is applied, and the run count increments on the automation detail page. (If the comment account differs from step 6 and has no open messaging window, the DM reply may not deliver; the tag action still applies — the operator's pre-built automation should include a Tag-contact action so the comment path is demonstrable regardless of the window.)

> **Operator pre-check (required — the comment review will fail without these):**
> 1. **Set `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`** in the deployed environment, or the "Continue with Instagram" one-click button will not render (the form falls back to manual entry only).
> 2. **Enable the `comments` field on the Instagram webhook.** Our per-account subscribe call (`subscribeIgWebhooks()` in `lib/instagram/subscribe.ts`) only subscribes `messages,messaging_postbacks,message_reactions,messaging_referral` — it does **not** subscribe `comments`. In the **Meta App Dashboard → Webhooks → Instagram**, check the `comments` field for the app. Verify delivery is actually wired by opening `https://xyra-chat.vercel.app/api/channels/instagram/debug-subscription` (signed in as the channel's org owner) and confirming the app appears in Meta's `subscribed_apps` response for the channel. If a channel shows nothing, hit `https://xyra-chat.vercel.app/api/channels/instagram/subscribe-existing` to re-run the per-account subscribe.
> 3. **Pre-build the demo automation** on the connected Instagram channel: trigger **IG comment keyword** with the keyword from step 8 above, and at least one Tag-contact action (window-independent) plus the follow-up Send DM action. Confirm it is **Active**.

### Data handling

Instagram user data (contacts, conversations, and messages) is received exclusively via Meta's webhook and the Graph API and stored in our PostgreSQL database (Supabase). Contacts are identified by their Instagram user ID; conversations link a contact to the connected channel; messages cover inbound and outbound Direct Messages and comment events. Comment data we store is limited to comment ID, author ID, author username, comment text, and post ID. Channel access tokens are encrypted at rest in Supabase Vault, and only the Vault reference (a UUID) is stored on the channel row. Access is restricted by row-level security: only authenticated members of the owning organization can view that organization's conversations through the dashboard (`/inbox`, `/settings/channels`). Users can delete conversations, and our standard soft-delete and GDPR erasure paths remove the associated data.

### Rejection risks & mitigations

- **`comments` webhook field is not auto-subscribed.** The per-account subscribe call (`subscribeIgWebhooks()` in `lib/instagram/subscribe.ts`, lines 24–27) subscribes only `messages,messaging_postbacks,message_reactions,messaging_referral` — it does **not** subscribe `comments` or `mentions`. The webhook handler fully processes incoming comment changes (`handleChange`, `route.ts:220–244`) and dispatches the `ig_comment_keyword` automation, but those events never arrive unless the `comments` field is enabled in the Meta App Dashboard. **Mitigation:** the operator pre-check above enables the `comments` field and verifies it via the existing diagnostic endpoint `GET /api/channels/instagram/debug-subscription` (re-subscribe via `GET /api/channels/instagram/subscribe-existing`). Recommended product follow-up: add `comments` to the `subscribed_fields` in `subscribeIgWebhooks` so the field is requested automatically on connect (the field still has to be enabled at the app level, but this removes the per-account miss).
- **Comment-triggered DM reply is subject to Instagram's 24-hour messaging window.** The comment automation's default reply action (`send_dm`, `lib/automations/executor.ts:87–114`) sends through the standard `/messages` `RESPONSE` path, not Meta's `/{comment_id}/private_replies` endpoint. A DM to a commenter with no open messaging window may not be delivered, which could read to a reviewer as the feature not working. **Mitigation:** the screencast and reviewer steps comment from the same account that DM'd the business moments earlier (opening the window), and the operator's demo automation includes a window-independent Tag-contact action so the comment path is demonstrably exercised regardless of the window. Recommended product follow-up: route comment replies through `private_replies` when no window is open.
- **Reviewer may not see why `manage_comments` is requested.** The use case is keyword-triggered responses to comments, not passive comment display. **Mitigation:** the permission justification above states this explicitly, and the screencast + reviewer steps demonstrate a live keyword-triggered comment response with the automation run count incrementing. (Note: the connection form lists the three required scopes but does not itself explain the comment-automation use case — the justification and screencast carry that explanation, so they must clearly show the keyword-triggered response.)
- **Comment automation could read as dead code if events never arrive.** The `ig_comment_keyword` trigger is fully wired: offered in the builder (`automation-builder.tsx:42`), typed in the schema (`lib/automations/types.ts`), filtered by keyword + optional post ID (`lib/automations/triggers.ts:59–72`), and executed end-to-end (`executor.ts`). It only appears unused if the webhook subscription is misconfigured. **Mitigation:** complete the operator pre-check (enable + verify the `comments` field), then record the screencast showing a real comment matching the keyword, the configured response applied, and the run count incrementing — proving the path is live.

---

## Messenger

### Surface summary

Xyra Chat's Messenger surface provides a unified-inbox experience for Facebook Pages. A workspace admin connects a Page by supplying its numeric Page ID and a Page access token; Xyra Chat subscribes that Page to our webhook so inbound Messenger DMs are delivered to us, and human agents reply directly from the Xyra Chat inbox. Outbound replies are text messages sent to Messenger via the Graph API (v22.0) `POST /{page_id}/messages` with `messaging_type: "RESPONSE"`. On the inbound side we receive and store message text, attachments (image/video/audio/file), delivery/read receipts, and the sender's public profile (name, avatar) fetched from Facebook on first contact. (Outbound media/templates are not yet implemented — agents reply in text today.)

### Permissions requested

> Note for the operator: only `pages_messaging` and `pages_manage_metadata` are exercised by the code. Drop `pages_show_list` from the App Dashboard request before submitting — including an unused permission is itself a common rejection cause (see Rejection risks).

#### `pages_messaging`

We use `pages_messaging` to receive direct messages sent to a connected Facebook Page and to reply to them from our unified inbox. When a customer messages the Page, the message event is delivered to our webhook at `/api/webhooks/messenger`, where we store the text, any attachments, and delivery/read receipts against the conversation, then notify the assigned human agent. When that agent writes a reply in the Xyra Chat inbox, we send it back to the customer by calling `POST /{page_id}/messages` on the Graph API (v22.0) with the Page access token, `messaging_type: "RESPONSE"`, and a text body. This permission is the core of the feature: without it we can neither receive Page DMs nor answer them. Every send is a human agent (or the customer's assigned bot) replying inside an existing customer-initiated conversation — we do not initiate unsolicited outbound messaging.

#### `pages_manage_metadata`

We use `pages_manage_metadata` once, during channel setup, to subscribe the connected Page to our app's webhook so that inbound Messenger events are actually delivered to us. When the admin enters the Page ID and token and clicks "Connect channel", we call `POST /{page_id}/subscribed_apps` with `subscribed_fields=messages,messaging_postbacks,message_deliveries,message_reads`. This single call both validates that the supplied token is a valid Page access token for that Page and wires up event delivery. Without this permission the Page is never subscribed, so no inbound DMs would ever reach the Xyra Chat inbox and the connection would be inert. We do not modify Page settings, posts, profile fields, or any other metadata — the only call we make is the `subscribed_apps` subscription.

> Honest scope note for the reviewer: although we subscribe to `messaging_postbacks` for forward-compatibility, our webhook handler currently processes only `messages`, `message_deliveries`, and `message_reads`. Button postbacks are not yet surfaced in the product, so testing a postback will not produce a visible result today. The two-way text conversation (inbound message → reply) is the flow this submission demonstrates.

#### `pages_show_list` (recommend removing — not exercised)

`pages_show_list` is listed in the requested scope but is **not used by our code**. We do not call `me/accounts` or any other Graph API endpoint that enumerates the Pages a person administers. The entire connect flow is manual: the admin types the numeric Page ID into a form field and pastes a Page access token they generated themselves in the Meta App Dashboard (Messenger → Settings → Access Tokens). Because there is no Page-listing call anywhere in the connect flow, this permission is dormant. We recommend narrowing the submission to `pages_messaging` + `pages_manage_metadata` only. If a reviewer requires it to remain for a future Continue-with-Facebook page-picker flow, note that the picker UI is not built and the permission is currently unused.

### Screencast script

Total runtime: ~2:40. The operator records the live web app at `https://xyra-chat.vercel.app`. Have a second device (or a colleague) ready to send a Messenger DM to the test Page on cue at 01:30.

- **00:00** — Logged-in Xyra Chat dashboard on screen. Narration: "This is Xyra Chat, a unified customer-messaging inbox. I'll connect a Facebook Page so its Messenger DMs arrive here."
- **00:08** — Click the left sidebar → **Settings**, then **Channels**. The Channels page is shown. Narration: "Here is the Channels page, where I add a new messaging channel."
- **00:16** — Click the **Add channel** button (top-right), then choose **Facebook Messenger** from the dropdown. Narration: "I select Facebook Messenger."
- **00:24** — The connect page `/settings/channels/messenger/new` is shown, Step 1 visible. Narration: "Step 1 shows the webhook callback URL and verify token. This is a one-time app-level setup in the Meta dashboard, already completed for this app."
- **00:38** — Scroll to Step 2 "Page credentials". Type a channel name (e.g. "Support Page"), type the **Page ID**, paste the **Page access token** (the token field is masked, with a reveal toggle). Narration: "In Step 2 I name the channel, enter the Page ID, and paste a Page access token I generated in the Meta App Dashboard. I enter the Page ID by hand — there is no account picker."
- **01:02** — Click **Connect channel**. Narration: "On connect, Xyra Chat subscribes this Page to our webhook using pages_manage_metadata. This same call validates the Page access token."
- **01:10** — Redirect lands on `/settings/channels?connected=messenger`, a success toast appears, and the new channel shows as active in the list. Narration: "The channel is now active and listening for inbound Messenger messages."
- **01:20** — Navigate to the **Inbox**. Narration: "I switch to the unified inbox, currently empty for this Page."
- **01:30** — On the second device, send a Messenger DM to the Page (e.g. "Hi, what are your opening hours?"). Cut back to the inbox. Narration: "A customer sends a message to our Facebook Page from Messenger."
- **01:45** — The new inbound conversation appears in the inbox list in real time, showing the sender's name and avatar. Click it to open the thread. Narration: "Using pages_messaging, the message arrives in real time with the sender's public name and avatar."
- **02:05** — Type a reply in the composer (e.g. "Hi! We're open 9am–6pm Monday to Friday.") and send it. Narration: "An agent replies in text directly from the Xyra Chat inbox. The reply is sent via the Graph API to Messenger."
- **02:20** — Cut to the second device showing the reply delivered inside Messenger. Narration: "The reply is delivered back to the customer in Messenger — closing the loop on a real two-way conversation."
- **02:35** — Cut back to the inbox showing the full thread (inbound + outbound) and the delivery state on the reply. Narration: "Both messages are in one threaded conversation, with delivery status tracked. That's the complete Messenger flow in Xyra Chat."

### Reviewer test instructions

1. Open `https://xyra-chat.vercel.app` and log in with the test credentials below.
   - Email: `__OPERATOR_FILLS_IN__`
   - Password: `__OPERATOR_FILLS_IN__`
   - (This account belongs to a test organization with a connected Facebook Messenger channel.)
2. In the left sidebar, go to **Settings → Channels**. Confirm a channel of type **Facebook Messenger** is listed as active. (To watch the full connect flow, the operator can demonstrate **Add channel → Facebook Messenger** and re-enter Page credentials — see the screencast. Note the Page ID is entered manually; there is no Page picker.)
3. Open the **Inbox** from the sidebar.
4. From a Facebook account, send a Messenger DM to the test Page:
   - Test Page name: `__OPERATOR_FILLS_IN__`
   - Test Page link/handle: `__OPERATOR_FILLS_IN__`
   - (If the app is still in Development mode, the reviewer's Facebook account must be added as a Tester/role on the app, OR use the operator-provided Facebook test user — operator confirms which: `__OPERATOR_FILLS_IN__`.)
5. Confirm the message appears in the Xyra Chat inbox in real time, with the sender's name and avatar populated.
6. Click the conversation to open the thread, type a **text** reply in the composer, and send it. Confirm the reply is delivered back in Messenger on the sending account. (Outbound is text-only today; sending an image/attachment is not yet supported.)
7. (Optional) In **Settings → Channels**, click **Disconnect** on the channel. After disconnect, Xyra Chat stops processing inbound webhooks for that Page (the channel is soft-deleted and the webhook handler ignores events for it). Meta-side revocation of the Page token/subscription remains a manual step in the App Dashboard — see Data handling.

Operator pre-recording checklist: ensure the Meta app's Messenger webhook is configured (Callback URL `https://xyra-chat.vercel.app/api/webhooks/messenger`, verify token = `MESSENGER_WEBHOOK_VERIFY_TOKEN`), the test Page has a valid Page access token connected in Xyra Chat, and the reviewer's account (or a provided Facebook test user) can message the Page while the app is in Development mode.

### Data handling

Xyra Chat receives a Facebook Page ID and a manually supplied Page access token at connect time; the token is immediately encrypted and stored in Supabase Vault, with only a vault reference UUID persisted in our `channels` table — the plaintext token is never stored in our application database and is transmitted only over HTTPS to Xyra Chat and to the Meta Graph API (v22.0) as a Bearer credential in the `Authorization` header, never in a URL query string. Inbound Messenger data (message text, attachments, delivery/read receipts, and the sender's public profile name and avatar fetched from the Facebook Profile API on first contact) is stored in our `conversations`, `messages`, and `contacts` tables, scoped to the connecting organization and protected by row-level security so only members of that organization can read it. We do not sell this data or share it with third parties; tokens and message content leave our systems only in calls back to Meta to send replies, fetch sender profiles, and subscribe the Page webhook.

Retention and removal: message history is retained for the life of the workspace so agents keep conversation context. When an admin disconnects a Messenger channel, the channel is soft-deleted (`deleted_at` set) and our webhook **stops processing inbound events for that Page ID** (the handler filters on `deleted_at IS NULL`); existing conversation history is preserved but no longer receives or sends messages. Disconnecting does **not** automatically revoke the subscription on Meta's side or purge the stored messages — Meta-side cleanup (revoking the Page access token / removing the app subscription in the Meta App Dashboard) is a manual operator step, and full erasure of stored message and contact data is performed on a verified deletion request via our GDPR erasure path (org/workspace soft-delete cascade). We will honor Meta Platform Policy data-deletion requirements, including deletion of Page-derived data on request.

### Rejection risks & mitigations

- **Excessive permissions — `pages_show_list` is requested but never used.** The connect flow accepts a manually typed Page ID and a pasted Page access token; no Graph API call lists the connecting user's Pages. *Mitigation:* remove `pages_show_list` from the requested scope in the App Dashboard and submit only `pages_messaging` + `pages_manage_metadata`.
- **Token obtained by manual entry rather than OAuth.** A reviewer expecting a Login-with-Facebook token exchange may view copy-pasted tokens as less secure. *Mitigation:* state that manual entry is intentional for this admin-only setup step, that the token is encrypted in Supabase Vault on receipt (vault UUID stored, plaintext never persisted), and that it is transmitted only over HTTPS and only as a Bearer header to Meta — never in a URL query string.
- **Per-message profile fetch.** On first contact we call the Facebook Profile API (`fields=name,profile_pic`) with the Page token to populate the contact's display name and avatar. A reviewer may see this as over-reaching for restricted-profile senders. *Mitigation:* the call is fail-soft — if the API denies, errors, or the token is missing, we proceed with `null` and simply show no name/avatar; the contact is still created from the PSID. Displaying the sender's name/avatar is a standard, expected feature of a messaging inbox.
- **Subscribed-but-unhandled field (`messaging_postbacks`).** We subscribe to `messaging_postbacks` but do not yet surface postback events in the product. *Mitigation:* a reviewer testing a button postback will see no visible result. We do not claim postback support in this submission; the demonstrated flow is inbound text message → real-time inbox → text reply → delivery back to Messenger. We will remove unused subscribed fields if the reviewer prefers a tighter subscription.
- **Data retention and deletion.** Messages, contact profiles, and receipts are stored for the life of the workspace. *Mitigation:* a per-channel **Disconnect** button soft-deletes the channel (`deleted_at`), after which our webhook drops inbound events for that Page ID (handler filters on `deleted_at IS NULL`); Meta-side token/subscription revocation is a documented manual operator step, and full erasure of Page-derived data is performed on request via our GDPR erasure path. We will comply with Meta Platform Policy deletion-on-request obligations.
- **Webhook authenticity.** Reviewers will check that inbound events are verified. *Mitigation:* every `POST /api/webhooks/messenger` is validated by extracting the `x-hub-signature-256` header and comparing an HMAC-SHA256 of the raw request body against `META_APP_SECRET` (Messenger is a product on the original Facebook app) using `timingSafeEqual` (constant-time, with an equal-length guard); a mismatch returns HTTP 401 and the event is rejected and logged. The GET verification handshake validates `hub.verify_token` against `MESSENGER_WEBHOOK_VERIFY_TOKEN` and returns 403 on mismatch.
