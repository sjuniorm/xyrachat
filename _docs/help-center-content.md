# Xyra Chat — help-center knowledge (seed into the help bot)

> Paste these into the in-app help bot's **Knowledge** sources (one text source
> per section is fine, or all at once). Set `SUPPORT_BOT_ID` to that bot. This is
> the self-serve answer base for `/help` + the help widget + `/api/support/chat`.
> Written customer-facing (second person), Xyra's actual flows.

---

## Getting started
**What is Xyra Chat?** One inbox for every customer conversation — WhatsApp,
Instagram DMs, Facebook Messenger, Telegram, email, and a website chat widget —
plus AI bots, automations, and broadcasts on top.

**First steps:** 1) Sign up and create your workspace. 2) Connect a channel
(Settings → Channels). 3) Reply to incoming messages from the Inbox. 4) Optional:
build an AI bot, set up automations, invite teammates.

**The fastest channel to test with:** Telegram or the web chat widget — neither
needs Meta approval, so they work the moment you connect them.

## Connecting channels (Settings → Channels → Add channel)
- **WhatsApp** — connect your WhatsApp Business number (one-click embedded signup,
  or paste the Phone Number ID + token). Requires a Meta WhatsApp Business account.
- **Instagram** — "Continue with Instagram" (Instagram Business Login) for a
  professional/business IG account, or manual entry.
- **Facebook Messenger** — "Continue with Facebook" and pick the Page, or paste a
  Page token.
- **Telegram** — create a bot with @BotFather, paste the bot token. Instant.
- **Email** — pick an inbox address (`you@mail.xyrachat.com`) or forward your
  existing support address to it.
- **Web chat** — copy the widget snippet onto your site.

> While your WhatsApp/Instagram/Messenger apps are in Meta review, only your test
> accounts can message them. Telegram, email, and web chat work for everyone
> immediately.

## The Inbox
- Filters: All / Mine / Unassigned / Bot / Closed; filter by channel; sort by
  activity.
- Assign a chat to a teammate, close/reopen it, or snooze it.
- The composer has **AI Assist** (improve / friendlier / shorter / fix grammar),
  **Suggest reply** (drafts a reply grounded in your bot's knowledge), saved
  replies, and an internal-note toggle (notes are team-only, never sent to the
  customer).
- Incoming messages in another language can be auto-translated (toggle it per
  channel) or translated on demand from the message menu.

## AI bots (Bots)
- Create a bot, pick an **objective** (support, lead generation, sales, booking,
  qualification, website traffic, or custom), set its tone, and add **knowledge**
  (paste text, add a URL, or upload a PDF/DOCX).
- **The bot only answers from the knowledge you give it.** With no knowledge it
  will warn you and answer from general AI — always add your real content
  (prices, policies, FAQs) so answers are accurate.
- Assign the bot to a channel (Assign tab). It replies automatically, hands off
  to a human when it can't help or when a customer asks, and pauses itself for a
  few hours after a human agent replies.
- Test it in the **Test** tab before going live; tune the "knowledge strictness"
  there (lower = answers more; higher = hands off sooner).
- Rate replies 👍/👎 — the Overview tab shows the bot's quality over time.

## Automations
- Trigger → actions. Triggers: a keyword in a DM/comment, a story mention, a
  first message, or an external webhook. Actions: send a DM, tag the contact,
  assign an agent, call a webhook.
- **Instagram comment/DM → link (the ManyChat way):** use a **Send buttons**
  action — the auto-reply offers a button like "Send me the link"; when the
  customer taps it, the link is sent. On a comment trigger the first reply is a
  private reply to the comment so it reaches first-time commenters.
- Note: a "new follower" trigger isn't possible — Instagram's API never reveals
  who follows you. Use the "First message" trigger instead.

## Broadcasts + templates (WhatsApp)
- WhatsApp requires pre-approved **templates** for outbound marketing. Build one
  in Templates, submit it to Meta, and check its status with "Sync from Meta".
- **Broadcasts** send an approved template to an audience (all contacts, by tag,
  or active-since a date). Opted-out contacts are skipped automatically; "STOP"
  unsubscribes and "START" re-subscribes.

## Team
- Invite teammates (Settings → Team) as owner, admin, supervisor, or agent.
- Toggle your availability (online / away / offline).
- Switch between workspaces from the sidebar if you belong to more than one.

## Billing & plans (Settings → Billing)
- Plans: **Social Lite €19** (Instagram automations only, no manual inbox),
  **Solo €29**, **Core €49**, **Edge €99** (most popular), **Prime €199**,
  **Infinite €399**. Annual billing = 2 months free.
- Add-ons (on Edge+): extra users, channels, chatbots, AI tokens, integrations,
  broadcasts.
- Each plan includes a monthly AI-token allowance; AI features pause when it runs
  out and resume next cycle (or upgrade / buy the +AI tokens add-on).
- Manage or cancel anytime from the billing portal; have a promo code? Enter it
  on the billing page.

## Integrations & API (Edge+)
- Connect **Make, Zapier, or n8n** to wire Xyra into 1000s of apps (e.g. new lead
  → Google Sheets / Slack / your CRM).
- Connect a **CRM** (HubSpot, Pipedrive, Salesforce) so captured leads sync
  automatically (Settings → CRM).
- Or use the REST API + signed webhooks directly (Settings → API).

## Privacy & data
- Hosted in the EU (GDPR-aligned). Export or delete your workspace data anytime.
- You can grant Xyra Support time-boxed, revocable access to your workspace to
  help (Settings → Team → Support access) — a banner shows everyone while it's
  active, and every access is logged.

## Troubleshooting
- **Bot gives the same/short answer or won't answer:** it has no knowledge yet —
  add sources in the bot's Knowledge tab. (If AI features are down entirely, the
  workspace's AI tokens may be exhausted, or the operator's AI key needs credit.)
- **WhatsApp message won't send outside 24h:** WhatsApp only allows free-form
  replies within 24h of the customer's last message — use an approved template
  to re-engage.
- **A channel stopped receiving:** reconnect it in Settings → Channels (a token
  may have expired).
