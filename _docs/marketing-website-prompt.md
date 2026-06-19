# Marketing-website build prompt (paste into v0 / a fresh Claude / your builder)

> Source of truth for the xyrachat.com marketing site. Prices final as of
> 2026-06-19. App lives at app.xyrachat.com; this site lives at xyrachat.com.

---

Build a high-converting marketing website for **Xyra Chat**, a multi-channel
customer-messaging SaaS. Deploy target: **xyrachat.com** (Vercel). All product
CTAs link to the app at **https://app.xyrachat.com** (sign up / log in). This is
a marketing site only — no app logic, no auth, no database.

## Product (what to communicate)
Xyra Chat is one shared inbox for every channel a business talks to customers on:
**WhatsApp, Instagram DM, Facebook Messenger, Telegram, Email, and website live
chat.** On top of the inbox:
- **AI chatbots** — train on your own content (docs/URLs), answer 24/7, qualify
  leads, **book meetings on your Google/Outlook calendar**, and hand off to a
  human when needed.
- **Automations** — ManyChat-style: a trigger (keyword, IG comment/DM, first
  message, external webhook) runs actions (auto-reply, tag, assign, wait, branch).
- **WhatsApp broadcasts & templates** — send approved campaigns to opted-in
  contacts, with opt-out handling.
- **Team inbox** — assign, snooze, internal notes, roles, availability.
- **Analytics** — CSAT/NPS surveys, bot performance, response times.
- **Apps everywhere** — web, iOS/Android (React Native), and a desktop app.
- **Developer platform** — REST API + outbound webhooks + Make / Zapier / n8n
  connectors.

**Audience:** small & mid-sized businesses, agencies, e-commerce, and
service/booking businesses that get DMs across many channels and want one place
to handle them — with AI doing the repetitive parts.

**One-liner:** "Every customer conversation, one inbox — answered by AI, closed
by your team."

## Brand identity (match the app exactly)
- Dark, premium, modern SaaS. Background `#0B0418`, surfaces `#1F1033`.
- Primary purple `#9333EA`, secondary pink `#EC4899`, signature glow `#D882FF`.
- Signature gradient (CTAs, wordmark, highlights): `linear-gradient(135deg,#9333EA 0%,#EC4899 100%)`.
- Font: **Inter** (next/font). Soft glows / halos behind hero + key cards.
- Use the existing logo/wordmark from the brand; keep visual consistency with
  the current xyrachat.com coming-soon page (it's the style reference).

## Pages / sections
1. **Top nav** — logo, links (Features, Channels, Pricing, Integrations, Docs),
   "Log in" (→ app.xyrachat.com/login) + gradient "Start free trial"
   (→ app.xyrachat.com/signup).
2. **Hero** — headline + subhead + the two CTAs + a product visual (inbox
   mockup). Trust line: "14-day free trial · no card required" (confirm card
   policy before publishing).
3. **Channels strip** — the 6 channels with icons (WhatsApp, Instagram,
   Messenger, Telegram, Email, Web chat) + "one inbox for all of them".
4. **Feature sections** (alternating left/right with visuals):
   - Unified inbox & team collaboration
   - AI chatbots that book meetings & qualify leads
   - No-code automations
   - WhatsApp broadcasts & templates
   - Analytics, CSAT & NPS
   - Mobile + desktop apps
   - API & integrations (Make / Zapier / n8n)
5. **How it works** — 3 steps: Connect your channels → Set up AI & automations →
   Reply from one inbox.
6. **Pricing** — monthly/annual toggle (annual = **2 months free**). Cards below.
7. **Integrations** — Make, Zapier, n8n logos + "build your own with our API".
8. **FAQ** — billing, channels, data/GDPR (EU-hosted), cancellation, Meta
   approval note for WhatsApp/IG.
9. **Final CTA band** — gradient, "Start your free trial".
10. **Footer** — product links, legal (Privacy → app.xyrachat.com/privacy,
    Terms → app.xyrachat.com/terms), social, company line.

## Pricing (EUR / month — render exactly these)
Monthly prices below; annual = pay 10 months (≈2 months free).

| Plan | Price/mo | Who it's for | Key limits |
|---|---|---|---|
| **Solo** | €29 | Instagram-first creators | Instagram only: auto-DMs, comment & DM keyword replies |
| **Core** | €49 | Solo businesses | 1 channel · 1 user · 1 chatbot · automations |
| **Edge** ⭐ *Most popular* | €99 | Growing teams | 6 channels · 5 users · 3 chatbots · API · automations |
| **Prime** | €199 | Scaling teams | 10 channels · 10 users · 3 chatbots · integrations · broadcasts · API |
| **Infinite** | €399 | High-volume / agencies | Unlimited everything · white-label · priority support |

Also show a **14-day free trial** entry point (all plans start with a trial).

**Add-ons** (show as a small "scale as you grow" row): extra user €10/mo ·
extra channel €15/mo · extra chatbot €25/mo · +500k AI tokens €19/mo ·
integrations (Make/Zapier/n8n) €29/mo · broadcasts €29/mo.

> Every paid plan CTA → `https://app.xyrachat.com/signup` (checkout happens
> inside the app via Stripe; the marketing site does not handle payment).

## Tech
- **Next.js (latest stable, App Router)** + **TypeScript** + **Tailwind CSS v4**,
  deployed on **Vercel** at xyrachat.com. (Use @latest across the stack.)
- Responsive, fast (good Core Web Vitals), accessible.
- SEO: per-page `<title>`/meta description, Open Graph + Twitter cards with a
  branded OG image, `sitemap.xml`, `robots.txt`, JSON-LD `SoftwareApplication`.
- Cookie consent banner for EU visitors if any analytics are added (GDPR).
- Keep it a static/marketing build — no Supabase, no secrets.

## Links & company details
- App: https://app.xyrachat.com  (signup `/signup`, login `/login`)
- YouTube: https://www.youtube.com/@XyraChat  (add Instagram / X / LinkedIn when ready)
- Legal entity (footer + /legal): **Mll Nexus Group SL** (trading as Mll Studio),
  CIF **B88931977**, Calle Poetas Españoles 1, Local 1, 38678 Armeñime, Santa
  Cruz de Tenerife, Spain. Contact: hello@xyrachat.com.
- Privacy/Terms can link to the app's pages (app.xyrachat.com/privacy + /terms)
  or mirror them on this domain — keep the text identical to the app's.

## Tone
Confident, concrete, benefit-led. Lead with outcomes ("Never miss a DM again",
"Let AI handle the first reply"), not feature jargon. Show real UI mockups.
