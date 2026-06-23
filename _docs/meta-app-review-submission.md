# Meta App Review — submission package (Xyra Chat)

> Copy-paste source for the App Review forms + a shot list for each screencast.
> Longest-pole launch dependency — start as soon as Business Verification clears.
> Legal entity **Mll Nexus Group SL · CIF B88931977**. Two Meta apps:
> - **Xyra Chat** (original) — WhatsApp + Messenger products. HMAC secret `META_APP_SECRET`.
> - **Xyra Chat-IG** — Instagram product. HMAC secret `INSTAGRAM_APP_SECRET`.
> Submit each app's permissions in its own App Review.

---

## 0) Before you open App Review

1. **Business Verification** (business.facebook.com → Security Center) is APPROVED
   for Mll Nexus Group SL (CIF B88931977). App Review permissions can't be
   granted until this is done.
2. **App settings → Basic**: Privacy Policy URL `https://xyrachat.com/privacy`,
   Terms URL `https://xyrachat.com/terms`, Data Deletion URL
   `https://xyrachat.com/privacy` (our GDPR delete is at `/api/gdpr/delete`;
   describe the request route in the privacy page), App icon, Category =
   "Business and Pages".
3. **App is in Live mode** before final submission (toggle top bar). Webhooks
   subscribed + verified (green) for each product.
4. A **reviewer test path**: Meta reviewers need to reproduce the use. Give them
   (a) a screencast, AND (b) where possible a test login. For us the cleanest is
   the screencast + a short written step list (below) since the inbox is behind
   our own auth — create a demo workspace `review@xyrachat.com` and include the
   credentials in the "Notes for reviewer" box of each permission.

---

## 1) App use-case description (reusable intro — paste into "How will you use…")

> Xyra Chat is a multi-channel customer-support inbox for small businesses. A
> business connects its own WhatsApp Business number, Instagram professional
> account, and/or Facebook Page. Messages customers send to those accounts are
> delivered to Xyra Chat via Webhooks and shown in one unified inbox, where the
> business's agents read and reply. Businesses can also set up an AI assistant
> and keyword automations to answer common questions and route conversations.
> Xyra Chat only ever accesses the messaging of businesses that explicitly
> connect their own accounts through Facebook Login / Instagram Business Login /
> WhatsApp Embedded Signup. We do not access any data belonging to people who
> have not messaged the connected business.

---

## 2) WhatsApp — app "Xyra Chat"

### Permission: `whatsapp_business_messaging`
**Justification (paste):**
> Xyra Chat uses whatsapp_business_messaging to (1) receive inbound WhatsApp
> messages sent by customers to the business's connected WhatsApp Business
> number (via the `messages` webhook field) and display them in the business's
> unified inbox, and (2) send the business agent's replies and approved message
> templates back to those customers through the Cloud API
> `/{phone-number-id}/messages` endpoint. It is also used to send the automatic
> STOP/START opt-out confirmation. Messaging is only ever on the number the
> business connected itself.

**Screencast shot list:**
1. Show `xyrachat.com` → sign in to the demo workspace.
2. Settings → Channels → show the connected WhatsApp number (or run Embedded
   Signup live: "Connect WhatsApp" → Facebook dialog → pick the WABA + number).
3. From a real phone, send a WhatsApp message to the connected number.
4. Show it arriving in the Xyra Chat inbox in real time.
5. Type a reply in Xyra Chat → Send → show it arriving on the phone.
6. Send "STOP" from the phone → show the opt-out confirmation auto-reply + the
   contact marked opted-out in Xyra Chat.

### Permission: `whatsapp_business_management`
**Justification (paste):**
> Xyra Chat uses whatsapp_business_management to let the business create and
> submit WhatsApp message templates for approval, read their approval status,
> and read the business's phone numbers/WABA details during channel connection.
> Templates are required to message customers outside the 24-hour service window
> (e.g. appointment reminders the customer asked for).

**Screencast shot list:**
1. Templates → "New template" → build a UTILITY template (name, body, sample) →
   Submit → show it appears as "Pending review" (this is the management API
   submitting to Meta).
2. Click "Sync from Meta" → show the status field updating from Meta.
3. (Optional) Show the connect flow reading the WABA's phone numbers.

> Note: the test WABA's templates approve in test; for the screencast a UTILITY
> template usually approves fast. If a template needs a media header, the builder
> uploads a sample via the Resumable Upload API — show that too if asked.

---

## 3) Messenger — app "Xyra Chat" (same app, Messenger product)

### Permission: `pages_messaging`
**Justification (paste):**
> Xyra Chat uses pages_messaging to receive messages people send to the
> business's connected Facebook Page (via the Messenger `messages` webhook on
> object `page`) and display them in the business's unified inbox, and to send
> the agent's replies back through `/{page-id}/messages` with
> messaging_type=RESPONSE (within the standard messaging window). Only Pages the
> business connects and grants access to are used.

**Screencast shot list:**
1. Settings → Channels → "Add channel → Messenger" → connect the Page (Facebook
   Login page-picker, or paste the Page token) → show "subscribed_apps" success.
2. From another Facebook account, message the Page.
3. Show it in the Xyra Chat inbox.
4. Reply from Xyra Chat → show it delivered in Messenger.

### Permission: `pages_manage_metadata` (only if Meta requires it for webhook subscription)
**Justification (paste):**
> Used solely to subscribe the connected Page to the app's Messenger webhooks
> (`/{page-id}/subscribed_apps`) so the business receives its own inbound
> messages. No Page content is modified.

---

## 4) Instagram — app "Xyra Chat-IG"

### Permission: `instagram_business_manage_messages` (+ `instagram_business_basic`)
**Justification (paste):**
> Xyra Chat uses instagram_business_manage_messages to receive Instagram Direct
> messages, story replies, and message reactions that customers send to the
> business's connected Instagram professional account (via the `messages`
> webhook) and show them in the business's unified inbox, and to send the
> agent's replies back via the Instagram messaging API. instagram_business_basic
> is used during connection to read the connected account's id, username, and
> profile picture to label the inbox. Only the account the business connects via
> Instagram Business Login is accessed.

**Screencast shot list:**
1. Settings → Channels → "Add channel → Instagram" → "Continue with Instagram"
   → Instagram Business Login → authorize → show the connected account.
2. From another Instagram account, DM the connected professional account.
3. Show it in the Xyra Chat inbox (incl. a story reply + a reaction if easy).
4. Reply from Xyra Chat → show it delivered in Instagram DMs.
5. (Optional, if you also request comment automations) Comment a keyword on the
   business's post → show the automation auto-replying.

---

## 5) Data-handling answers (App Review "Data Use" section)

- **What data do you collect/store?** Customer messages + basic contact identity
  (name, phone/IG handle/PSID, profile picture URL) for the connected business,
  stored to power the inbox. No data from non-messaging users.
- **Why store it?** To provide the inbox history, search, and AI assistant the
  business relies on; messages persist so agents see conversation context.
- **Deletion:** Businesses can delete their workspace (GDPR erasure) via Settings
  → the request soft-deletes and a retention job purges; the data-deletion route
  is documented at `/privacy`. End-customers who opt out (STOP) are flagged and
  no longer messaged.
- **Subprocessors:** Supabase (database/storage, EU), Anthropic + OpenAI (AI
  replies — message content sent at request time, not used for training),
  Resend (email channel), PostHog EU (product analytics, no message content,
  session recording disabled). List these on `/privacy`.
- **Sharing:** No selling/sharing of messaging data. AI subprocessors process
  transiently to generate a reply.

---

## 6) Common rejection reasons — pre-empt them

- **Screencast doesn't show the full round-trip.** Always show: connect → inbound
  arrives → agent replies → customer receives. Reviewers reject "just the UI."
- **Permission broader than the demo.** Only request what the screencast shows.
  We don't request `pages_read_engagement`, content publishing, etc.
- **Privacy policy mismatch.** The /privacy page MUST list message storage + the
  AI/Resend/Supabase subprocessors + the deletion route. Align before submitting.
- **Login required but no test creds.** Put demo workspace creds + the connected
  test number/account in the "Notes for reviewer".
- **App in dev mode.** Flip to Live before final submit.

---

## 7) Order of operations

1. Business Verification (done — CIF B88931977). ✅
2. Set Basic settings (privacy/terms/deletion/icon) on BOTH apps.
3. Connect a real test WABA, a test Page, and a test IG professional account.
4. Record the 3–4 screencasts above.
5. Submit "Xyra Chat" app: whatsapp_business_messaging + whatsapp_business_management
   + pages_messaging (+ pages_manage_metadata if prompted).
6. Submit "Xyra Chat-IG" app: instagram_business_manage_messages + instagram_business_basic.
7. While pending, only added testers can use the live channels — Telegram + Email
   + Webchat work for everyone immediately (no Meta review), so onboard early
   customers on those.

---

## 8) Pre-submit CODE verification (done — all flows wired)

A per-flow trace of each reviewer script against the actual code (4-agent pass).
**Result: every demo step is wired end-to-end — no code gaps, no broken paths.**

| Permission | Flow | Verdict |
|---|---|---|
| `whatsapp_business_messaging` | connect → realtime inbound → reply → STOP/START | ✅ ready |
| `whatsapp_business_management` | build+submit template → Meta POST → sync status | ✅ ready |
| `pages_messaging` (Messenger) | connect Page + subscribe → inbound → reply | ✅ ready |
| `instagram_business_manage_messages` (+ `_basic`) | connect → DM → reply → story/reaction | ✅ ready* |

\* IG is code-ready; its only caveats are **operator env/dashboard config** (not
code). Set these in the review environment BEFORE submitting or the reviewer hits
a dead end:

**Per-flow operator preconditions (the reviewer env MUST have these):**
- **WhatsApp:** `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (GET handshake 500s if unset) +
  `META_APP_SECRET` (POST 401s if unset). WABA added to the app; migrations
  003 + 006 + 018 applied. (STOP arrives as a fresh inbound → opens the 24h
  window, so the auto-confirmation text is deliverable.)
- **WhatsApp templates:** the demo WA channel needs `wa_business_account_id` +
  a Vault token, else `createTemplate` errors before reaching Meta.
- **Messenger:** `MESSENGER_WEBHOOK_VERIFY_TOKEN` + `META_APP_SECRET`; Page
  subscribed to the app (the connect action does this).
- **Instagram:** `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (GET 500s if unset) +
  `INSTAGRAM_APP_SECRET` (POST 401s if unset; falls back to `META_APP_SECRET`).
  **`INSTAGRAM_APP_ID` must be set for the "Continue with Instagram" button to
  render** — otherwise only manual entry shows, so either set it OR script the
  manual-connect path in the screencast. App subscribed to `messages` +
  `message_reactions` webhook fields.

Minor non-blocking note (template sync): "Sync from Meta" only UPDATEs local
rows matched by (channel_id, name, language); a template that exists on Meta but
not locally is skipped (no insert). Doesn't affect the scripted create→sync demo.
