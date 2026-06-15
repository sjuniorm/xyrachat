# Prompt for the marketing-site repo (xyra-chat-website)

Paste this into a Claude Code session **in the separate `xyra-chat-website`
repo** (https://xyra-chat-website.vercel.app). It makes the marketing site match
the *actually shipped* app and adds the Meta Verified Partner badge.

⚠️ **Only display the "Meta Verified Partner" badge AFTER Meta Business
Verification actually clears.** Claiming it before is a policy/trust risk.

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

PRICING (show a pricing section; EUR/mo, annual = 2 months free). FIVE packs —
these are the final names + prices (match lib/billing/bundles.ts):
- **Solo €29/mo** — Instagram ONLY: auto-DMs, comment & DM keyword replies. 1 user.
  No other channels, no add-ons. (The cheap ManyChat-style wedge. Show as "coming
  at launch" until Meta/Instagram approval clears.)
- **Core €49/mo** — 1 channel (any), 1 user, 1 AI chatbot, automations (limited).
  No API, no integrations, no broadcasts.
- **Edge €99/mo** — 6 channels, 5 users, 3 chatbots, full API, unlimited
  automations. Add-ons available. (Mark "Most popular".)
- **Prime €199/mo** — 10 channels, 10 users, 3 chatbots, integrations
  (Make/Zapier/n8n), broadcasts, full API. Add-ons available.
- **Infinite €399/mo** — unlimited everything, white-label, priority support,
  voice (soon). (Can show as "Contact us / from €399".)
- 14-day free trial, no card. Launch intro offer: 40% off the first 3 months.
- ADD-ONS (only on Edge & Prime): extra user €10/mo; + (prices TBD, mark "from")
  extra channel, extra chatbot, extra AI tokens (+500k), integrations unlock
  (Edge), broadcasts unlock (Edge); voice/PBX "coming". A reseller plan is planned
  (don't list yet).
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
3. Add a "Meta Verified Partner" badge + trust row — BUT gate it behind an env
   flag (e.g. NEXT_PUBLIC_META_VERIFIED) defaulting OFF, so it only renders once
   we flip it on after verification clears. Do not show it by default.
4. Keep CTAs pointing at the app sign-up. Keep /privacy + /terms links.
5. Match the app's brand tokens exactly.
6. Add a YouTube link in the footer (and any "follow us"/social row): the
   official channel is https://www.youtube.com/@XyraChat — use a YouTube icon,
   open in a new tab (rel="noopener"). It's the only social link for now; leave
   placeholders for others off unless we have real URLs.

After: list what you changed and what (if anything) you weren't sure we ship so
I can confirm before it goes live.
```
