// Product changelog — the source of truth for the in-app /changelog page and
// the sidebar "What's new" unseen-dot. Newest entry first. `version` is the
// stable key the client compares against localStorage to decide whether to
// show the unseen indicator, so keep it unique + monotonic.

export type ChangelogTag = "feature" | "improvement" | "fix";

export type ChangelogEntry = {
  version: string; // unique, newest-first; also the "seen" key
  date: string; // ISO date (YYYY-MM-DD)
  title: string;
  tag: ChangelogTag;
  highlights: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.15",
    date: "2026-06-10",
    title: "Rate your bot, one-click connect & support access",
    tag: "feature",
    highlights: [
      "Give any AI reply a 👍 or 👎 right in the inbox — your scores roll up on each bot's Overview so you can see (and improve) reply quality.",
      "Connect WhatsApp and Facebook Messenger in a few clicks with Meta — no hunting for IDs or tokens.",
      "New Support access control in Settings → Team: let Xyra Support into your workspace only when you choose, time-boxed and revocable, with a banner while it's on.",
    ],
  },
  {
    version: "1.14",
    date: "2026-06-10",
    title: "AI activity on every message",
    tag: "feature",
    highlights: [
      "Each message now shows what the AI did — e.g. “AI reply · from your knowledge · 2s”, “Auto-translated from Spanish”, “Automated”, or “Lead captured”.",
      "Live in the unified inbox across every channel, so you can see your bots and automations working at a glance.",
    ],
  },
  {
    version: "1.13",
    date: "2026-06-09",
    title: "Analytics dashboard",
    tag: "feature",
    highlights: [
      "New Analytics page: conversation volume, messages, bot replies/handoffs, leads, and CSAT/NPS over 7/30/90 days.",
      "See volume broken down by channel, and export your conversations to CSV.",
    ],
  },
  {
    version: "1.12",
    date: "2026-06-09",
    title: "Customer satisfaction surveys",
    tag: "feature",
    highlights: [
      "Automatically ask customers to rate their experience (CSAT or NPS) when a conversation closes — works on every channel.",
      "One-tap rating link; results roll up to a CSAT average and NPS score in Settings → Inbox.",
    ],
  },
  {
    version: "1.11",
    date: "2026-06-09",
    title: "Agent productivity boosts",
    tag: "feature",
    highlights: [
      "One-tap AI summary of any conversation, with suggested tags you can apply in a click.",
      "Saved replies now support {{contact_name}} variables, categories, and usage tracking.",
    ],
  },
  {
    version: "1.10",
    date: "2026-06-09",
    title: "Website chat widget",
    tag: "feature",
    highlights: [
      "Add a live chat bubble to any website with one copy-paste snippet — no Meta or external account needed.",
      "Website messages land in your unified inbox alongside every other channel; your bot can auto-answer.",
      "Style it to your brand (color, greeting, labels) right from channel setup.",
    ],
  },
  {
    version: "1.9",
    date: "2026-06-09",
    title: "Drip sequences",
    tag: "feature",
    highlights: [
      "Build reusable drip sequences — a series of follow-up messages sent over minutes, hours, or days.",
      "Enroll a contact into a sequence from any automation with the new Add to sequence step.",
      "Manage sequences from Automations → Sequences; pause or edit them anytime.",
    ],
  },
  {
    version: "1.8",
    date: "2026-06-09",
    title: "Knowledge uploads & inbox polish",
    tag: "improvement",
    highlights: [
      "Train a bot by uploading a PDF, Word doc, or text file — we extract and index it automatically.",
      "Images and files customers send on WhatsApp and Telegram now render right in the inbox.",
      "Conversation list shows real unread counts, and saved replies are now editable.",
    ],
  },
  {
    version: "1.7",
    date: "2026-06-09",
    title: "Facebook Messenger joins the inbox",
    tag: "feature",
    highlights: [
      "Connect a Facebook Page and handle Messenger DMs right alongside WhatsApp, Instagram, Telegram, and Email.",
      "Your bots, automations, and AI Assist all work on Messenger out of the box — no extra setup.",
      "Assign, snooze, auto-translate, and reply to Messenger chats just like any other channel.",
    ],
  },
  {
    version: "1.6",
    date: "2026-06-05",
    title: "Smarter bots & finer control",
    tag: "feature",
    highlights: [
      "Bots can now understand images a customer sends — screenshots, photos, receipts — and reply about them.",
      "Voice notes are transcribed automatically, so bots (and agents) can read what was said.",
      "New per-conversation controls: switch any chat to bot-only mode, or pin a specific bot to it.",
      "Give a bot its own schedule per channel — e.g. replying on WhatsApp 9–5 but on Instagram 24/7.",
    ],
  },
  {
    version: "1.5",
    date: "2026-06-01",
    title: "Take Xyra anywhere",
    tag: "feature",
    highlights: [
      "New mobile app for iOS & Android — reply, assign, and use AI Assist on the go.",
      "Desktop app for macOS & Windows with native notifications.",
      "Team chat and multi-workspace switching for agencies running several brands.",
    ],
  },
  {
    version: "1.4",
    date: "2026-05-30",
    title: "Visual automations",
    tag: "feature",
    highlights: [
      "Build automations on a visual flow canvas instead of a flat list.",
      "Add delays, if/else branches, and wait-for-reply steps to a flow.",
      "Bots can take actions mid-chat: capture a lead, tag a contact, or request a human handoff.",
    ],
  },
  {
    version: "1.3",
    date: "2026-05-28",
    title: "Open up Xyra",
    tag: "feature",
    highlights: [
      "Public REST API with API keys, scopes, and outbound webhooks.",
      "Official Make, Zapier, and n8n connectors.",
      "In-dashboard API reference with live Swagger and code samples.",
    ],
  },
  {
    version: "1.2",
    date: "2026-05-27",
    title: "Plans & billing",
    tag: "feature",
    highlights: [
      "Self-serve plans with Stripe checkout and a customer portal.",
      "Live usage meters for channels, bots, team seats, and AI tokens.",
      "Promo codes and a smoother upgrade/downgrade flow.",
    ],
  },
  {
    version: "1.1",
    date: "2026-05-24",
    title: "AI bots, templates & broadcasts",
    tag: "feature",
    highlights: [
      "Train an AI bot on your own knowledge (paste text or a URL) and assign it to channels.",
      "Build and submit WhatsApp message templates, then run targeted broadcasts.",
      "Automatic STOP/START opt-out handling on WhatsApp.",
    ],
  },
  {
    version: "1.0",
    date: "2026-05-20",
    title: "One inbox for every channel",
    tag: "feature",
    highlights: [
      "Unified inbox across WhatsApp, Instagram DM, Telegram, and Email.",
      "Assign conversations, snooze, add internal notes, and translate inbound messages.",
      "Real-time updates and browser notifications for your team.",
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0]?.version ?? "";
