import "server-only";
import { Section, Text } from "@react-email/components";
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  emailColors,
} from "./layout";

// Branded transactional email templates. Each is a pure presentational
// component rendered server-side by Resend (via the `react:` send option).
// All dynamic values are passed as props — no data fetching here.

export function WelcomeEmail({
  orgName,
  inboxUrl,
}: {
  orgName: string;
  inboxUrl: string;
}) {
  return (
    <EmailLayout preview={`Welcome to Xyra Chat — ${orgName} is ready`}>
      <EmailHeading>Welcome to Xyra Chat 🎉</EmailHeading>
      <EmailText>
        Your workspace <strong style={{ color: emailColors.text }}>{orgName}</strong>{" "}
        is ready. Connect a channel — WhatsApp, Instagram, Telegram or Email — and
        start replying to every customer from one shared inbox.
      </EmailText>
      <EmailButton href={inboxUrl}>Open your inbox</EmailButton>
      <Text
        style={{
          color: emailColors.muted,
          fontSize: 13,
          lineHeight: "20px",
          margin: "20px 0 0",
        }}
      >
        Next steps: connect a channel, invite your team, and train an AI bot on
        your own knowledge.
      </Text>
    </EmailLayout>
  );
}

export function TeamInviteEmail({
  inviterName,
  orgName,
  acceptUrl,
}: {
  inviterName: string;
  orgName: string;
  acceptUrl: string;
}) {
  return (
    <EmailLayout preview={`You've been invited to ${orgName} on Xyra Chat`}>
      <EmailHeading>You&apos;re invited to {orgName}</EmailHeading>
      <EmailText>
        {inviterName} invited you to join their workspace on Xyra Chat. Accept the
        invitation to set your password and start handling conversations with the
        team.
      </EmailText>
      <EmailButton href={acceptUrl}>Accept invitation</EmailButton>
    </EmailLayout>
  );
}

export function TrialEndingEmail({
  orgName,
  daysLeft,
  manageUrl,
}: {
  orgName: string;
  daysLeft: number;
  manageUrl: string;
}) {
  return (
    <EmailLayout preview={`Your Xyra Chat trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}>
      <EmailHeading>
        Your trial ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}
      </EmailHeading>
      <EmailText>
        Your free trial for <strong style={{ color: emailColors.text }}>{orgName}</strong>{" "}
        is almost over. Choose a plan now to keep your channels, bots and
        automations running without interruption.
      </EmailText>
      <EmailButton href={manageUrl}>Choose a plan</EmailButton>
    </EmailLayout>
  );
}

export function BotFeedbackEmail({
  orgName,
  botName,
  replyText,
  reason,
  conversationUrl,
}: {
  orgName: string;
  botName: string;
  replyText: string;
  reason: string;
  conversationUrl: string;
}) {
  const quote = (s: string) => (s.length > 600 ? `${s.slice(0, 600)}…` : s);
  return (
    <EmailLayout preview={`Negative bot feedback from ${orgName}`}>
      <EmailHeading>👎 Bot feedback from {orgName}</EmailHeading>
      <EmailText>
        An agent at <strong style={{ color: emailColors.text }}>{orgName}</strong>{" "}
        marked a reply from <strong style={{ color: emailColors.text }}>{botName}</strong>{" "}
        as unhelpful. Reach out to help them tune it.
      </EmailText>
      <Text
        style={{
          color: emailColors.muted,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          margin: "16px 0 4px",
        }}
      >
        What went wrong
      </Text>
      <Text style={{ color: emailColors.text, fontSize: 15, lineHeight: "22px", margin: "0 0 12px" }}>
        {reason}
      </Text>
      {replyText && (
        <>
          <Text
            style={{
              color: emailColors.muted,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              margin: "16px 0 4px",
            }}
          >
            The bot reply
          </Text>
          <Text
            style={{
              color: emailColors.muted,
              fontSize: 14,
              lineHeight: "21px",
              margin: "0 0 16px",
              fontStyle: "italic",
            }}
          >
            “{quote(replyText)}”
          </Text>
        </>
      )}
      <EmailButton href={conversationUrl}>Open the conversation</EmailButton>
    </EmailLayout>
  );
}

export function PaymentFailedEmail({
  orgName,
  manageUrl,
}: {
  orgName: string;
  manageUrl: string;
}) {
  return (
    <EmailLayout preview="Action needed: your Xyra Chat payment failed">
      <EmailHeading>We couldn&apos;t process your payment</EmailHeading>
      <EmailText>
        The latest payment for <strong style={{ color: emailColors.text }}>{orgName}</strong>{" "}
        didn&apos;t go through. Update your payment method to avoid any
        interruption to your workspace.
      </EmailText>
      <Section style={{ margin: "0 0 16px" }}>
        <EmailButton href={manageUrl}>Update payment method</EmailButton>
      </Section>
      <Text style={{ color: emailColors.muted, fontSize: 13, lineHeight: "20px", margin: 0 }}>
        If you&apos;ve already updated it, you can ignore this email.
      </Text>
    </EmailLayout>
  );
}
