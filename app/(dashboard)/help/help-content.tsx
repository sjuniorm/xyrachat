import type { ReactNode } from "react";
import Link from "next/link";
import {
  Rocket,
  Plug,
  Inbox,
  Bot,
  Megaphone,
  Sparkles,
  Users,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Presentational helpers — small, dark-themed building blocks so every article
// reads consistently. Server-safe (no client hooks).
// ---------------------------------------------------------------------------
export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 mt-7 text-base font-medium text-white first:mt-0">
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-white/70">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="ml-1 list-disc space-y-1.5 pl-4 text-white/70 marker:text-white/30">
      {children}
    </ul>
  );
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="ml-1 list-decimal space-y-1.5 pl-4 text-white/70 marker:text-white/40">
      {children}
    </ol>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return <li className="leading-relaxed">{children}</li>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[color:var(--xyra-glow)] underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-[color:var(--xyra-purple)]/30 bg-[color:var(--xyra-purple)]/10 px-3 py-2 text-[13px] text-white/80">
      {children}
    </div>
  );
}

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  body: () => ReactNode;
};

// ---------------------------------------------------------------------------
// Articles. Kept concise + accurate to the actual product surfaces. Each links
// to the relevant in-app page so the reader can act immediately.
// ---------------------------------------------------------------------------
export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "From sign-up to your first reply in five minutes.",
    icon: Rocket,
    body: () => (
      <>
        <P>
          Xyra Chat brings every customer conversation — WhatsApp, Instagram,
          Telegram and email — into one shared inbox, with AI assistants,
          broadcasts and automations on top.
        </P>
        <H2>The five-minute path</H2>
        <OL>
          <LI>
            Create your workspace during onboarding (you become the owner).
          </LI>
          <LI>
            Connect a channel under{" "}
            <A href="/settings/channels">Settings → Channels</A>. Telegram is the
            quickest to test — see{" "}
            <A href="/help/connect-a-channel">Connecting a channel</A>.
          </LI>
          <LI>
            Invite teammates from{" "}
            <A href="/settings/team">Settings → Team</A> so replies are shared.
          </LI>
          <LI>
            Head to the <A href="/inbox">Inbox</A> — incoming messages land here
            in real time. Reply, assign, snooze or close.
          </LI>
          <LI>
            Optional but powerful: build an <A href="/help/ai-bots">AI bot</A> to
            answer common questions automatically.
          </LI>
        </OL>
        <Note>
          Everything is GDPR-first: data is soft-deleted (recoverable), EU
          visitors get a cookie banner, and you can export or erase a contact
          on request.
        </Note>
      </>
    ),
  },
  {
    slug: "connect-a-channel",
    title: "Connecting a channel",
    summary: "WhatsApp, Instagram, Telegram and email — what you need for each.",
    icon: Plug,
    body: () => (
      <>
        <P>
          Add channels from{" "}
          <A href="/settings/channels">Settings → Channels → Add channel</A>.
          Each channel is owned by your workspace and its access token is stored
          encrypted (Supabase Vault) — never in plain text.
        </P>
        <H2>WhatsApp</H2>
        <P>
          Uses the Meta Cloud API. You&apos;ll paste your webhook URL + verify
          token into the Meta App Dashboard, then enter your Phone Number ID,
          WhatsApp Business Account ID and a permanent access token. To message
          customers outside the 24-hour window you&apos;ll also need approved{" "}
          <A href="/help/templates-and-broadcasts">templates</A>.
        </P>
        <H2>Instagram</H2>
        <P>
          Use “Continue with Facebook” for the guided flow, or enter your Page
          ID, IG Business Account ID and access token manually. Your IG account
          must be a Business/Creator account. During Meta&apos;s review period
          only test accounts can message you.
        </P>
        <H2>Telegram</H2>
        <P>
          The fastest channel to go live. Create a bot with @BotFather, copy the
          bot token into the Telegram channel form, and we register the webhook
          for you. Real messages flow immediately — no review.
        </P>
        <H2>Email</H2>
        <P>
          Pick an inbox prefix and customers email{" "}
          <code className="text-white/80">prefix@your-domain</code>. Replies
          thread correctly via standard email headers. (Email delivery requires
          the inbound domain&apos;s MX records to point at our email provider —
          your operator sets this up once.)
        </P>
        <Note>
          Token expired or rotated? Use the per-channel “Rotate token” action on{" "}
          <A href="/settings/channels">Settings → Channels</A> — no SQL needed.
        </Note>
      </>
    ),
  },
  {
    slug: "using-the-inbox",
    title: "Using the inbox",
    summary: "Filters, assignment, snoozing, AI assist and saved replies.",
    icon: Inbox,
    body: () => (
      <>
        <P>
          The <A href="/inbox">Inbox</A> is a three-panel view: conversation
          list, message thread, and contact details. New messages appear live.
        </P>
        <H2>Organising conversations</H2>
        <UL>
          <LI>
            <strong>Filters:</strong> All, Mine, Unassigned, Bot and Closed.
            Filter by channel, and sort by activity.
          </LI>
          <LI>
            <strong>Assign</strong> a conversation to a teammate (availability
            dots show who&apos;s online).
          </LI>
          <LI>
            <strong>Snooze</strong> to hide until later (1h, 4h, tomorrow, next
            week), <strong>close</strong> when resolved, or{" "}
            <strong>transfer to bot</strong>.
          </LI>
          <LI>
            <strong>Mark as unread</strong> from the ⋯ menu to revisit later.
            Unread badges are per-agent.
          </LI>
        </UL>
        <H2>Replying faster</H2>
        <UL>
          <LI>
            <strong>AI Assist</strong> rewrites your draft (friendlier, shorter,
            fix grammar, translate…).
          </LI>
          <LI>
            <strong>Suggest reply</strong> drafts a full answer grounded in the
            bot&apos;s knowledge (on bot-assigned channels).
          </LI>
          <LI>
            <strong>Saved replies</strong> insert canned responses; create new
            ones inline from the composer.
          </LI>
          <LI>
            <strong>Translate</strong> inbound messages with a show-original
            toggle. Auto-translate can be turned on per channel.
          </LI>
        </UL>
        <H2>Contact panel</H2>
        <P>
          Edit the contact&apos;s name, tags and notes on the right — changes
          save automatically and sync to your{" "}
          <A href="/contacts">Contacts</A> address book.
        </P>
        <Note>
          Shortcuts: ⌘K focus search · ⌘↵ send · ⌘J AI Assist · ⌘L suggest reply.
        </Note>
      </>
    ),
  },
  {
    slug: "ai-bots",
    title: "AI bots & knowledge",
    summary: "Create an assistant, train it on your content, assign it to channels.",
    icon: Bot,
    body: () => (
      <>
        <P>
          Bots answer customers automatically using your own knowledge. Build
          one from <A href="/bots/new">Bots → New bot</A>.
        </P>
        <H2>1. Pick an objective</H2>
        <P>
          Support, lead generation, sales, booking, qualification and more —
          picking one seeds sensible defaults (instructions, greeting, handoff
          triggers) you can tweak.
        </P>
        <H2>2. Add knowledge</H2>
        <P>
          On the bot&apos;s <strong>Knowledge</strong> tab, paste text or add a
          URL to scrape. Content is chunked and embedded so the bot retrieves
          the most relevant passages when answering. Watch the embedding status
          badge until it&apos;s ready.
        </P>
        <H2>3. Tune & test</H2>
        <UL>
          <LI>
            Set tone, response length and the{" "}
            <strong>knowledge threshold</strong> (how confident a match must be
            before the bot uses it).
          </LI>
          <LI>
            Add <strong>handoff triggers</strong> — phrases that route the chat
            to a human.
          </LI>
          <LI>
            Use the <strong>Test</strong> tab to chat with the bot privately. It
            shows which sources were used and their similarity score, so you can
            tune the threshold.
          </LI>
        </UL>
        <H2>4. Assign to channels</H2>
        <P>
          On the <strong>Assign</strong> tab, flip the bot on for a channel
          (one bot per channel). It respects business hours, a 6-hour
          auto-pause when a human replies, and the WhatsApp 24-hour window.
        </P>
        <Note>
          AI usage counts against your plan&apos;s monthly token budget — track
          it on <A href="/settings/billing">Billing</A>.
        </Note>
      </>
    ),
  },
  {
    slug: "templates-and-broadcasts",
    title: "Templates & broadcasts",
    summary: "Submit WhatsApp templates and send them to targeted audiences.",
    icon: Megaphone,
    body: () => (
      <>
        <P>
          WhatsApp requires pre-approved <strong>templates</strong> to start
          conversations outside the 24-hour window. Broadcasts send those
          templates to many contacts at once.
        </P>
        <H2>Creating a template</H2>
        <OL>
          <LI>
            Go to <A href="/templates/new">Templates → New template</A>. Pick a
            channel, name, category (Marketing / Utility / Authentication) and
            language.
          </LI>
          <LI>
            Build the header, body (with {"{{1}}"} variables), footer and
            buttons. The live preview shows how it&apos;ll look.
          </LI>
          <LI>
            Submit to Meta. Status updates from Pending → Approved/Rejected — hit{" "}
            <strong>Sync from Meta</strong> to refresh. You can{" "}
            <strong>edit</strong> an approved or rejected template (it
            re-enters review; the approved version keeps sending meanwhile).
          </LI>
        </OL>
        <H2>Sending a broadcast</H2>
        <OL>
          <LI>
            <A href="/broadcasts/new">Broadcasts → New broadcast</A>: choose an
            approved template and map its variables.
          </LI>
          <LI>
            Pick an audience — everyone, by tag, or active since a date. The live
            count shows who&apos;ll receive it and who&apos;s opted out.
          </LI>
          <LI>
            Send now or schedule. You can <strong>cancel</strong> a
            draft/scheduled broadcast, or stop one mid-send.
          </LI>
        </OL>
        <Note>
          Opt-outs are automatic: a customer replying STOP is unsubscribed and
          skipped on future broadcasts (and they can re-subscribe). Stay
          compliant — only message contacts who opted in.
        </Note>
      </>
    ),
  },
  {
    slug: "automations",
    title: "Automations",
    summary: "Trigger actions from keywords, comments and new conversations.",
    icon: Sparkles,
    body: () => (
      <>
        <P>
          Automations run deterministic flows: a trigger fires an ordered list
          of actions. They complement bots — bots handle open-ended chat,
          automations handle “if X then do Y”. Build from{" "}
          <A href="/automations/new">Automations → New automation</A>.
        </P>
        <H2>Triggers</H2>
        <UL>
          <LI>WhatsApp keyword, Instagram DM keyword, IG comment keyword</LI>
          <LI>Instagram story mention</LI>
          <LI>Conversation opened (first message in)</LI>
          <LI>External webhook (from the public API)</LI>
        </UL>
        <H2>Actions</H2>
        <UL>
          <LI>Send a DM (with {"{{contact_name}}"}-style personalisation)</LI>
          <LI>Tag the contact</LI>
          <LI>Assign the conversation to an agent</LI>
          <LI>POST to an external webhook</LI>
        </UL>
        <P>
          Each automation&apos;s detail page shows run counts and the last 20
          runs with per-step outcomes, so you can see exactly what happened.
        </P>
        <Note>
          One-shot triggers (like conversation-opened) fire once per contact, so
          a returning customer isn&apos;t spammed.
        </Note>
      </>
    ),
  },
  {
    slug: "team-and-roles",
    title: "Team & roles",
    summary: "Invite teammates, set roles and availability, share the workload.",
    icon: Users,
    body: () => (
      <>
        <P>
          Manage your team from <A href="/settings/team">Settings → Team</A>.
          Owners and admins can invite; invitees set a password before they land
          in the product.
        </P>
        <H2>Roles</H2>
        <UL>
          <LI>
            <strong>Owner</strong> — full control, including billing. Can&apos;t
            be removed.
          </LI>
          <LI>
            <strong>Admin</strong> — manage channels, team, templates,
            broadcasts and automations.
          </LI>
          <LI>
            <strong>Supervisor</strong> — can launch broadcasts and edit
            automations.
          </LI>
          <LI>
            <strong>Agent</strong> — handles conversations in the inbox.
          </LI>
        </UL>
        <H2>Availability & assignment</H2>
        <P>
          Set yourself online / away / offline from the sidebar avatar menu. In
          a conversation, assign it to any teammate — availability dots help you
          route to someone who&apos;s on. Closing a conversation unassigns it.
        </P>
        <Note>
          Browser notifications alert you when a conversation is assigned to you
          or a new message arrives on one of yours — allow them when prompted.
        </Note>
      </>
    ),
  },
  {
    slug: "plans-and-billing",
    title: "Plans & billing",
    summary: "Usage meters, upgrades, promo codes and cancellation.",
    icon: CreditCard,
    body: () => (
      <>
        <P>
          See your plan, live usage and upgrade options on{" "}
          <A href="/settings/billing">Settings → Billing</A>.
        </P>
        <H2>What counts toward your plan</H2>
        <UL>
          <LI>Connected channels (and per-type limits)</LI>
          <LI>Team members</LI>
          <LI>Bots and knowledge sources</LI>
          <LI>Broadcasts per month</LI>
          <LI>Monthly AI token budget (bot replies, assist, translation)</LI>
        </UL>
        <P>
          The billing page shows a meter for each. When you approach a limit,
          you&apos;ll see a prompt to upgrade.
        </P>
        <H2>Upgrading & promo codes</H2>
        <P>
          Choose a plan (monthly or yearly) and check out via Stripe. Have a
          launch code? Enter it in the “Have a code?” box to apply a discount or
          extend your trial. Manage your card and invoices through the Stripe
          customer portal.
        </P>
        <H2>Cancelling</H2>
        <P>
          You can cancel from the billing page. If your current usage exceeds the
          plan you&apos;d drop to, we&apos;ll tell you what to reduce first. After
          cancellation your data is retained for a grace period before removal —
          and an operator can restore it within that window.
        </P>
      </>
    ),
  },
];

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
