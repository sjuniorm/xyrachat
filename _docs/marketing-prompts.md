# Xyra Chat — marketing generation prompts

Reusable prompts for Higgsfield (image/video), Midjourney/DALL·E, or any
LLM-based marketing/copy tool. Paste + tweak the bracketed bits.

## Brand kit (paste this as context first)
```
Brand: Xyra Chat — a multi-channel customer-messaging platform (unified inbox +
AI). Modern, premium, slightly futuristic SaaS. NOT playful/cartoonish.
Palette: deep near-black purple background #0B0418; sidebar #1F1033; primary
accent purple #9333EA; secondary accent pink #EC4899; signature glow #D882FF.
Signature gradient: 135° linear, #9333EA → #EC4899 (used on CTAs + the wordmark).
Typography: Inter, tight tracking, high contrast white text on dark.
Mood: calm, confident, "your customer conversations on autopilot". Lots of
negative space, soft glows/halos, glassmorphism, subtle gradients.
Avoid: stock-photo call-center clichés, clutter, rainbow colors, comic style.
```

## 1) Hero image (Higgsfield / Midjourney / DALL·E)
```
A sleek dark-mode SaaS product hero, 16:9. A floating glassmorphic "unified
inbox" UI panel glowing softly against a #0B0418 background, with channel
bubbles (WhatsApp green, Instagram gradient, a chat bubble, an envelope)
streaming into one elegant message list. A subtle 135° purple→pink (#9333EA →
#EC4899) gradient glow behind the panel, signature #D882FF halo, fine grain,
cinematic soft lighting, depth of field, premium, minimal, Inter-style UI text.
No logos, no real brand marks. --ar 16:9 --style raw
```

## 2) Product/feature shot (square, for social)
```
Square 1:1. A single dark glassmorphic chat bubble UI showing an AI reply, with
a small glowing badge "AI reply · from your knowledge". Purple→pink gradient
accent, #D882FF glow, deep #0B0418 backdrop, lots of negative space, crisp,
premium fintech-grade UI aesthetic. No watermarks.
```

## 3) Short promo video (Higgsfield generate_video)
```
8-second product motion piece, dark premium SaaS. Open on a phone receiving a
WhatsApp message; it smoothly flies into a glowing unified-inbox panel where an
AI auto-replies and a "Lead captured" chip animates in. Camera slow push-in,
soft purple→pink gradient light (#9333EA → #EC4899), #D882FF glow, elegant,
calm, confident. Subtle UI motion, no voiceover, no on-screen brand logos.
End on the empty inbox with "Zero missed messages" feel. 16:9.
```

## 4) Marketing copy prompt (ChatGPT/Claude/any)
```
You are a senior B2B SaaS copywriter. Write [ASSET: e.g. a landing hero +
3 value props / a 5-email onboarding sequence / 10 tweets] for Xyra Chat.

Product: a multi-channel customer-messaging platform. Businesses connect
WhatsApp, Instagram DM, Facebook Messenger, Telegram, Email, and a website chat
widget into ONE unified team inbox. An AI assistant (trained on the business's
own knowledge) auto-replies, auto-translates inbound messages, captures leads,
and hands off to a human when needed. Plus: automations (keyword → action),
drip sequences, WhatsApp broadcasts + templates, analytics with CSAT/NPS, a
public REST API, and Make/Zapier/n8n connectors. EU-hosted, GDPR-aligned.

ICP: SMBs and agencies doing sales/support over chat (e-commerce, services,
local businesses) across Europe.
Positioning: "Every customer conversation, every channel, one inbox — with AI
that actually replies." Think Superchat/ManyChat, but unified + AI-first.
Tone: confident, clear, benefit-led, no hype/jargon. Short sentences.
Constraints: no fake stats, no "revolutionary"; lead with the pain (missed
messages, juggling apps, slow replies) then the outcome.
```

## 5) Languages
Generate ES + EN + NL variants (your core markets — you're Canary-Islands-based
selling across Europe). Keep the same structure; localize idioms, not literal.

> Tip for Higgsfield: run prompts 1–3 through `generate_image`/`generate_video`,
> then `virality_predictor` on the video to sanity-check hook strength before
> posting.
