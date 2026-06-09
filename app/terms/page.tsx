import Link from "next/link";
import { XyraWordmark } from "@/components/brand/xyra-wordmark";

export const metadata = { title: "Terms of Service — Xyra Chat" };

// NOTE: thorough DRAFT. Have it reviewed by counsel and fill the [bracketed]
// entity / governing-law details before relying on it commercially.
const UPDATED = "3 June 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 prose prose-invert">
      <Link href="/" className="not-prose mb-8 inline-flex">
        <XyraWordmark size="sm" />
      </Link>
      <h1>Terms of Service</h1>
      <p className="not-prose rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        Draft pending final legal review. Confirm with counsel before relying on
        it commercially.
      </p>
      <p>
        <em>Last updated: {UPDATED}.</em>
      </p>

      <p>
        These Terms govern your use of Xyra Chat (the &quot;Service&quot;), operated
        by Mll Nexus Group SL (trading as Mll Studio) (&quot;we&quot;, &quot;us&quot;). By creating an account or
        using the Service you agree to these Terms and to our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>1. The Service</h2>
      <p>
        Xyra Chat is a multi-channel customer-messaging platform: a shared inbox,
        chatbots, automations, broadcasts, and a public API across WhatsApp,
        Instagram, Messenger, Telegram, email, and web chat. We may add, change, or
        remove features over time.
      </p>

      <h2>2. Accounts &amp; eligibility</h2>
      <p>
        You must provide accurate information, keep your credentials secure, and be
        responsible for activity under your account. You must be legally able to
        enter a contract and use the Service for a lawful business purpose.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>No spam, unsolicited bulk messaging, or activity that violates anti-spam laws (e.g. GDPR/ePrivacy, CAN-SPAM, TCPA).</li>
        <li>Comply with the policies of every channel you connect — WhatsApp Business / Meta Platform Policies, Telegram&apos;s terms, and email-sender requirements.</li>
        <li>No unlawful, infringing, deceptive, or harmful content; no malware; no attempts to breach security or other tenants&apos; isolation.</li>
        <li>Obtain valid consent/opt-in from the people you message, especially for broadcasts.</li>
      </ul>
      <p>We may suspend accounts that put our infrastructure, our provider relationships, or other customers at risk.</p>

      <h2>4. Your data &amp; responsibilities</h2>
      <p>
        You retain ownership of the content and contacts you bring to the Service. As
        between you and us, you are the controller of your end-customers&apos; data and
        are responsible for having a lawful basis to process it. We process it on your
        behalf as described in the Privacy Policy and any Data Processing Addendum.
        You are responsible for the channel credentials you connect and for usage that
        occurs through them.
      </p>

      <h2>5. Billing &amp; subscriptions</h2>
      <ul>
        <li>Paid plans are billed in advance (monthly or yearly) via Stripe. Trials, where offered, convert to paid unless cancelled before they end.</li>
        <li>You can cancel anytime; access continues until the end of the paid period. Fees already paid are non-refundable except where required by law.</li>
        <li>Plan limits (channels, team seats, AI usage, broadcasts, API access) apply per your plan; we may meter or throttle usage to enforce them.</li>
        <li>We may change pricing with reasonable prior notice; changes apply at your next renewal.</li>
      </ul>

      <h2>6. Intellectual property</h2>
      <p>
        We own the Service and its software. You own your content. You grant us the
        limited rights needed to operate the Service for you (e.g. transmitting and
        storing your messages, sending them to AI sub-processors when you enable AI).
      </p>

      <h2>7. Third-party services</h2>
      <p>
        The Service integrates with third parties (Meta, Telegram, Stripe, Anthropic,
        OpenAI, Resend, and others). Your use of those channels is also subject to
        their terms, and their availability is outside our control.
      </p>

      <h2>8. Disclaimers &amp; liability</h2>
      <p>
        The Service is provided &quot;as is&quot;. To the maximum extent permitted by
        law we disclaim implied warranties, and our aggregate liability is limited to
        the fees you paid in the 12 months before the claim. Nothing limits liability
        that cannot be limited by law.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate access
        for breach of these Terms or legal/operational necessity. On termination, data
        is handled per the retention section of the Privacy Policy (soft-delete then
        purge).
      </p>

      <h2>10. Changes &amp; governing law</h2>
      <p>
        We may update these Terms; material changes will be communicated in-app or by
        email. These Terms are governed by the laws of [jurisdiction], and disputes are
        subject to the courts of [venue].
      </p>

      <h2>11. Contact</h2>
      <p>
        <a href="mailto:legal@xyrachat.com">legal@xyrachat.com</a> · Operator: Mll
        Nexus Group SL (trading as Mll Studio), [registered address — to be completed].
      </p>

      <p className="text-sm text-white/50">
        <Link href="/privacy">Privacy Policy</Link>
      </p>
    </article>
  );
}
