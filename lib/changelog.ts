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
