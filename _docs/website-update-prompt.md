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

After: list what you changed and what (if anything) you weren't sure we ship so
I can confirm before it goes live.
```
