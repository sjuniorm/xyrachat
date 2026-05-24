# Key Rotation Runbook

Run when Week 3 testing wraps, and before any client launch. Every secret
listed here has been pasted into chat or auto-generated during dev — treat
them as exposed and rotate before going public.

## Order

Rotate Supabase keys **first** (they have the broadest blast radius — they
control your whole DB), Meta second, PostHog last. After each one, confirm
the app still works locally before moving on.

## 1. Supabase publishable + secret keys

- **Rotate at**: Supabase Dashboard → Project Settings → **API** → API Keys
- Click **Roll** on each of the publishable (`sb_publishable_…`) and secret
  (`sb_secret_…`) keys
- **Update**:
  - `.env.local` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
  - Vercel: `vercel env rm` + `vercel env add` for both, all 3 envs
- **Verify**: `npm run dev` → log in → confirm session persists; check
  `/api/gdpr/export` still works

## 2. Meta App Secret

- **Rotate at**: Meta App Dashboard → App settings → Basic → **Reset App Secret**
- **Update**:
  - `.env.local` → `META_APP_SECRET`
  - Vercel: `vercel env rm META_APP_SECRET` + add for all 3 envs
- **Verify**: Send a real WhatsApp message to the test number; check
  `/api/webhooks/whatsapp` accepts the new HMAC signature (look in
  `webhook_log` table for `signature_ok = true` rows from after the rotation)

## 2b. Instagram App Secret

Lives in its own Meta app ("Xyra Chat-IG"), separate from the WhatsApp app
above. Used for HMAC verification on `/api/webhooks/instagram` AND for the
Continue-with-Facebook OAuth flow.

- **Rotate at**: Meta App Dashboard → **Xyra Chat-IG** → Settings → Basic →
  **Reset App Secret**
- **Update**:
  - `.env.local` → `INSTAGRAM_APP_SECRET`
  - Vercel: `vercel env rm INSTAGRAM_APP_SECRET` + add for all 3 envs
- **Verify**: send a real DM to the connected IG test account; check
  `webhook_log` table for `signature_ok = true` rows from after the rotation

## 2c. Instagram Webhook Verify Token

- **Rotate at**: just generate a new random hex
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Update**:
  - `.env.local` → `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
  - Vercel: rm + add for all 3 envs
  - **Meta App Dashboard → Xyra Chat-IG → Webhooks → Instagram → Edit →
    paste new Verify Token → Verify and save**
- **Verify**: Meta's "Verify and save" returns success

## 3. WhatsApp Webhook Verify Token

- **Rotate at**: just generate a new random hex
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Update**:
  - `.env.local` → `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
  - Vercel: rm + add for all 3 envs
  - **Meta App Dashboard → WhatsApp → Configuration → Webhook → Edit →
    paste new Verify Token → Verify and save**
- **Verify**: Meta's "Verify and save" returns success

## 4. WhatsApp Channel access tokens (per channel)

Stored in Supabase Vault, not env. One per connected channel.

- **Rotate at**: Meta App Dashboard → Business Settings → System Users →
  select your system user → **Generate New Token** (select the WABA app)
- **Update**:
  - In Xyra: `/settings/channels` → (future: delete + re-add the channel,
    or paste new token in an edit form once we build it in Week 6)
- **Verify**: Send an outbound message from the inbox composer

## 5. Resend SMTP API key

Used by Supabase Auth → SMTP Settings to send invite / magic-link / password
reset emails from `team@xyrachat.com`.

- **Rotate at**: Resend Dashboard → **API Keys** → revoke the existing
  Xyra-Chat key → **Create API Key** → name `xyra-chat-smtp-<date>` → copy
- **Update**:
  - Supabase Dashboard → **Authentication → SMTP Settings** → paste new
    key in the **Password** field → Save
- **Verify**: send yourself a fresh invite from `/settings/team`; email
  arrives from `team@xyrachat.com` within ~30s.

## 5b. Anthropic API key

- **Rotate at**: https://console.anthropic.com/settings/keys →
  delete the existing key + create a new one. There's no "rotate" verb
  — Anthropic invalidates the old one when you delete it.
- **Update**:
  - `.env.local` → `ANTHROPIC_API_KEY`
  - Vercel: `vercel env rm ANTHROPIC_API_KEY` + add for all 3 envs
- **Verify**: open `/bots/[id]` Test tab on prod, send any message.
  Expect a reply within 3s and a tick on `/settings/billing` tokens
  counter.
- **Before rotating**: confirm a hard monthly cap is set at
  https://console.anthropic.com/settings/limits → Spend Limits.

## 5c. OpenAI API key

- **Rotate at**: https://platform.openai.com/api-keys → revoke the
  existing one + create a new one (project-scoped recommended).
- **Update**:
  - `.env.local` → `OPENAI_API_KEY`
  - Vercel: rm + add for all 3 envs
- **Verify**: upload a piece of text in `/bots/[id]/Knowledge`. Source
  row should flip pending → running → done within ~10s. If it goes to
  failed with "AI_QUOTA_EXCEEDED", that's the per-org gate, not the key.
- **Before rotating**: confirm a hard cap at https://platform.openai.com
  → Settings → Billing → Usage limits → Hard limit.

## 6. PostHog project API key

- **Rotate at**: PostHog → Project Settings → Project → **Rotate Project API key**
- **Update**:
  - `.env.local` → `NEXT_PUBLIC_POSTHOG_KEY`
  - Vercel: rm + add for all 3 envs
- **Verify**: PostHog → Live events → trigger a `signup` event by signing up
  a throwaway account; should appear within seconds

## Vercel rotation commands

```bash
# Remove old value from all 3 envs
vercel env rm <VAR> production --yes
vercel env rm <VAR> preview --yes
vercel env rm <VAR> development --yes

# Add new value to all 3 envs
vercel env add <VAR> production --value "<NEW_VALUE>" --yes
vercel env add <VAR> development --value "<NEW_VALUE>" --yes
vercel env add <VAR> preview "" --value "<NEW_VALUE>" --yes  # "" = all preview branches

# Trigger a redeploy to pick up the new env (or push to main)
vercel deploy --prod --yes
```

## After all rotations

1. `vercel env ls` → confirm all 6 secrets are present in all 3 envs
2. `git ls-files | grep -E "^\.env"` → should ONLY return `.env.example`
3. Smoke-test prod: visit https://xyra-chat.vercel.app → sign in → send a
   test WhatsApp message → it should round-trip
4. Re-test the GDPR endpoints (`/api/gdpr/export` while signed in)
