# Prompt for the marketing-site repo (xyra-chat-website)

Paste this into a Claude Code session **in the separate `xyra-chat-website`
repo** (https://xyra-chat-website.vercel.app). It makes the marketing site match
the *actually shipped* app and adds a factual Meta trust signal.

⚠️ **Meta status (2026-06): Business Verification has CLEARED.** We may show a
factual "Meta Business — verified" trust signal. It does **NOT** mean we're a
"Meta Business Partner" (a separate Meta program with its own application +
badge). Do not display a "Verified Partner" badge or partner logo unless we're
actually accepted into that program — claiming it is a policy/trust risk. App
Review (the `pages_messaging` / Instagram messaging permissions) is still in
progress, so don't promise IG/Messenger features as "live for everyone" — the
"connect your own account / available at launch" framing is the safe one.

---

```
Read your project memory first. You are updating the Xyra Chat MARKETING SITE so
it accurately matches the live product. Do NOT invent features — use ONLY the
shipped capabilities below.

BRAND (keep consistent with the app):
- Dark theme: bg #0B0418, surfaces #1F1033. Accent purple #9333EA, pink #EC4899,
  glow #D882FF. Signature CTA/wordmark gradient: 135°, #9333EA → #EC4899.
- Font: Inter. High-contrast white text on dark, generous negative space, soft
  glows/glassmorphism. Premium, calm, confident — not playful.

WHAT XYRA CHAT ACTUALLY DOES (shipped — safe to claim):
- Unified team inbox across 6 channels: WhatsApp, Instagram DM, Facebook
  Messenger, Telegram, Email, and an embeddable Website chat widget.
- AI assistant trained on the business's own knowledge (paste text, URLs, or
  upload PDF/DOCX): auto-replies grounded in that knowledge, auto-translates
  inbound messages, captures leads, and hands off to a human when needed. Every
  message shows what the AI did (e.g. "AI reply · from your knowledge",
  "Auto-translated from Spanish", "Lead captured").
- Automations: keyword/comment/first-message triggers → actions (auto-DM, tag,
  assign, webhook), with if/else branches, delays, wait-for-reply, and a visual
  flow canvas. Reusable drip sequences.
- WhatsApp message templates + audience-targeted broadcasts with STOP/START
  opt-out handling.
- Analytics dashboard (volume by channel, bot replies, handoffs, leads,
  CSAT/NPS) + CSV export. Automatic CSAT/NPS surveys on conversation close.
- Team: roles, assignment, internal notes, availability, multi-workspace.
- Mobile app (iOS/Android) + desktop app. Public REST API + webhooks +
  Make/Zapier/n8n connectors.
- EU-hosted, GDPR-aligned (data residency in the EU, opt-out handling,
  export/erasure).

PRICING (show a pricing section; EUR/mo, annual = 2 months free → yearly = ×10).
These are FINAL names + prices (match lib/billing/bundles.ts exactly):
- **Social Lite €19/mo (€190/yr)** — Instagram **automations only**: auto-DMs +
  comment/DM keyword replies + the button opt-in flow. 1 IG channel, 1 seat.
  NO manual inbox, NO AI chatbot. The cheapest entry tier — show it BELOW Solo.
- **Solo €29/mo (€290/yr)** — Instagram only, auto-DMs + keyword replies, **PLUS
  the unified manual inbox** + mobile/desktop apps, 1 seat. (Difference vs Social
  Lite: Solo gives you the inbox to reply by hand.)
- **Core €49/mo (€490/yr)** — 1 channel (any), 1 seat, 1 AI chatbot, automations,
  unified inbox with live translation.
- **Edge €99/mo (€990/yr)** — 6 channels, 5 seats, 3 chatbots, full REST API,
  automations, team roles, add-ons available. (Mark "Most popular".)
- **Prime €199/mo (€1990/yr)** — 10 channels, 10 seats, 3 chatbots, integrations
  (Make/Zapier/n8n), WhatsApp broadcasts, full API + webhooks. Add-ons available.
- **Infinite €399/mo (€3990/yr)** — unlimited channels/seats/chatbots, white-label,
  priority support. **Do NOT list "SSO/SAML" — it isn't built yet** (drop it, or
  mark "coming soon"). Voice/PBX is "coming", not available.
- 14-day free trial, no card.
- ADD-ONS (Edge & up), final prices: extra user €10/mo · extra channel €15/mo ·
  extra chatbot €25/mo · +500k AI tokens €19/mo · integrations €29/mo ·
  broadcasts €29/mo. (Voice/PBX add-on = "coming", not purchasable.)
- WhatsApp messages: customers connect their own WhatsApp Business — they pay Meta
  directly at cost, Xyra adds **no markup**. Answering customers is free; only
  marketing broadcasts cost (Meta's per-message fee). Use this as a selling point.
- Keep the exact numbers in ONE place / config so they're easy to change; treat
  these as the current intended prices (confirm before publishing).

MESSAGING:
- Hero: "Every customer conversation, every channel — one inbox, with AI that
  actually replies." (rework, don't copy verbatim)
- Value props: (1) Stop juggling apps — all channels in one inbox. (2) AI replies
  from YOUR knowledge, 24/7, in the customer's language. (3) Turn comments & DMs
  into leads automatically. (4) See what's working — analytics + CSAT.
- ICP: SMBs + agencies doing sales/support over chat, across Europe. Languages:
  EN, ES, NL.

TASKS:
1. Audit current site copy/sections against the list above; remove anything we
   don't actually ship; add the channels + AI-activity + analytics/CSAT stories.
2. Make the in-message AI annotations a visual feature on the site (they're real
   now) — show the little "AI reply · from your knowledge / Auto-translated /
   Lead captured" chips, matching the app.
3. Add a factual "Meta Business — verified" trust signal + trust row (verification
   HAS cleared). Wording must stay factual ("Verified business on Meta"), NOT
   "Meta Verified Partner"/"official partner" — that's a separate program we're
   not in. Gate it behind an env flag (e.g. NEXT_PUBLIC_META_VERIFIED) defaulting
   OFF so you can flip it on deliberately. Do NOT use Meta/WhatsApp/Instagram
   logos as endorsement.
4. REMOVE any "SSO & SAML" claim from the Infinite/top tier — it isn't built.
   Drop it, or label it "coming soon". Same for "voice/PBX" — only ever "coming",
   never "available".
5. Keep CTAs pointing at the app sign-up. Keep /privacy + /terms links.
6. Match the app's brand tokens exactly.
7. Add a YouTube link in the footer (and any "follow us"/social row): the
   official channel is https://www.youtube.com/@XyraChat — use a YouTube icon,
   open in a new tab (rel="noopener"). It's the only social link for now; leave
   placeholders for others off unless we have real URLs.

After: list what you changed and what (if anything) you weren't sure we ship so
I can confirm before it goes live.
```
