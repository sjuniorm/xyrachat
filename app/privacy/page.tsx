import Link from "next/link";
import { XyraWordmark } from "@/components/brand/xyra-wordmark";

export const metadata = { title: "Privacy Policy — Xyra Chat" };

// NOTE: thorough, app-accurate DRAFT. Have it reviewed by counsel (and fill the
// [bracketed] entity/jurisdiction details) before relying on it commercially.
const UPDATED = "3 June 2026";

const SUBPROCESSORS: { name: string; purpose: string; region: string }[] = [
  { name: "Supabase", purpose: "Database, auth, file storage, realtime", region: "EU (Frankfurt)" },
  { name: "Vercel", purpose: "Application hosting + edge network", region: "Global (EU/US)" },
  { name: "Anthropic", purpose: "AI assistant + reply generation (Claude)", region: "US" },
  { name: "OpenAI", purpose: "Text embeddings for knowledge search", region: "US" },
  { name: "Stripe", purpose: "Subscription billing + payments", region: "US/EU" },
  { name: "Resend", purpose: "Inbound + outbound email channel", region: "US/EU" },
  { name: "Meta Platforms", purpose: "WhatsApp + Instagram + Messenger channels", region: "Global" },
  { name: "Telegram", purpose: "Telegram bot channel", region: "Global" },
  { name: "PostHog", purpose: "Product analytics (no session recording)", region: "EU" },
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 prose prose-invert">
      <Link href="/" className="not-prose mb-8 inline-flex">
        <XyraWordmark size="sm" />
      </Link>
      <h1>Privacy Policy</h1>
      <p className="not-prose rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        Draft pending final legal review — accurate to how the Service works
        today; confirm with counsel before relying on it commercially.
      </p>
      <p>
        <em>Last updated: {UPDATED}.</em>
      </p>

      <p>
        Xyra Chat (the &quot;Service&quot;), operated by Mll Studio (&quot;we&quot;,
        &quot;us&quot;), is a multi-channel customer-messaging platform. This policy
        explains what personal data we process, why, and the rights you have. It is
        written to align with the EU General Data Protection Regulation (GDPR) and
        the UK GDPR.
      </p>

      <h2>1. Controller vs. processor</h2>
      <p>
        For the <strong>conversation data</strong> our customers handle through the
        Service — the messages, contacts, and channel identifiers of the people they
        talk to — the customer (the business using Xyra Chat) is the{" "}
        <strong>data controller</strong> and we act as a{" "}
        <strong>data processor</strong> on their instructions. For our own{" "}
        <strong>account and analytics data</strong> (your name, email, billing,
        product usage), we are the controller.
      </p>

      <h2>2. Data we process</h2>
      <ul>
        <li><strong>Account data</strong>: name, email, hashed password, role, organization, availability.</li>
        <li><strong>Customer conversation data</strong> (on behalf of customers): message contents, contact names / phone numbers / emails / social handles, attachments, tags, notes, conversation metadata.</li>
        <li><strong>Channel credentials</strong>: access tokens for connected channels, encrypted at rest in Supabase Vault (only a vault reference lives in the database).</li>
        <li><strong>Billing data</strong>: plan, subscription status, and a Stripe customer reference. Card details are handled by Stripe — we never see or store them.</li>
        <li><strong>Usage analytics</strong>: feature events via PostHog (EU). We do <strong>not</strong> record sessions or capture message contents in analytics.</li>
      </ul>

      <h2>3. AI processing</h2>
      <p>
        When a customer enables the AI assistant, message text and that customer&apos;s
        own knowledge sources are sent to Anthropic (Claude) to generate replies and
        to OpenAI to compute embeddings for knowledge search. These providers act as
        sub-processors and, per their API terms, do not train their models on data
        sent via their APIs. AI features can be disabled per channel.
      </p>

      <h2>4. Legal bases (GDPR Art. 6)</h2>
      <ul>
        <li><strong>Performance of a contract</strong> — to provide the Service.</li>
        <li><strong>Legitimate interests</strong> — security, product analytics, abuse prevention.</li>
        <li><strong>Consent</strong> — non-essential cookies (EU visitors) and marketing.</li>
        <li><strong>Legal obligation</strong> — tax, accounting, lawful requests.</li>
      </ul>

      <h2>5. Sub-processors</h2>
      <p>We share data with the following sub-processors strictly to run the Service:</p>
      <div className="not-prose overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/15 text-left text-white/60">
              <th className="py-2 pr-4 font-medium">Sub-processor</th>
              <th className="py-2 pr-4 font-medium">Purpose</th>
              <th className="py-2 font-medium">Region</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="border-b border-white/5">
                <td className="py-2 pr-4 font-medium text-white">{s.name}</td>
                <td className="py-2 pr-4 text-white/70">{s.purpose}</td>
                <td className="py-2 text-white/70">{s.region}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>6. International transfers</h2>
      <p>
        We host primary data in the EU where possible (Supabase Frankfurt, PostHog
        EU). Some sub-processors (e.g. Anthropic, OpenAI) process data in the US under
        Standard Contractual Clauses and/or the EU–US Data Privacy Framework.
      </p>

      <h2>7. Retention</h2>
      <p>
        We use soft-deletion across the platform. When an organization cancels, its
        data is retained for up to 30 days and then permanently purged. You can
        request earlier erasure at any time. Account data is kept for the life of the
        account plus any legally required period.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Under the GDPR you may request access, rectification, erasure, restriction,
        portability, and object to processing. Signed-in users can export their data
        (<code>/api/gdpr/export</code>) and request erasure
        (<code>/api/gdpr/delete</code>), or email us. End customers of our business
        users should contact that business (the controller); we assist them as
        processor.
      </p>

      <h2>9. Cookies</h2>
      <p>
        We use essential cookies for authentication. Analytics cookies (PostHog) load
        only after consent for visitors in the EEA, via our cookie banner.
      </p>

      <h2>10. Security</h2>
      <p>
        Data is isolated per organization via row-level security, channel access
        tokens are encrypted in Supabase Vault, API keys are stored only as salted
        hashes, and all webhooks are signature-verified.
      </p>

      <h2>11. Contact</h2>
      <p>
        Privacy questions: <a href="mailto:privacy@xyrachat.com">privacy@xyrachat.com</a>.
        Operator: Mll Studio, [legal entity name + registered address]. EU
        representative / DPO (if applicable): [to be completed].
      </p>

      <p className="text-sm text-white/50">
        <Link href="/terms">Terms of Service</Link>
      </p>
    </article>
  );
}
