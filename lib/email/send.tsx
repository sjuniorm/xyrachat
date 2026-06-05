import "server-only";
import { Resend } from "resend";
import type { ReactElement } from "react";
import {
  PaymentFailedEmail,
  TeamInviteEmail,
  TrialEndingEmail,
  WelcomeEmail,
} from "./templates";

// Transactional (system → user) email. Separate from the email CHANNEL
// (customer support inbox). Every send is FAIL-SOFT: it never throws and never
// blocks the calling flow — a missing RESEND_API_KEY / unverified domain just
// returns { ok:false } and the user action proceeds normally. Delivery is gated
// on the Resend domain being configured (operator task); until then sends skip.

const FROM = process.env.EMAIL_FROM_ADDRESS ?? "Xyra Chat <noreply@xyrachat.com>";

function appUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://xyra-chat.vercel.app";
  return `${base}${path}`;
}

export type SendResult =
  | { ok: true }
  | { ok: false; error: string; skipped?: boolean };

async function send(args: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set", skipped: true };
  if (!args.to) return { ok: false, error: "missing recipient" };
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject: args.subject,
      react: args.react,
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function sendWelcomeEmail(to: string, orgName: string): Promise<SendResult> {
  return send({
    to,
    subject: "Welcome to Xyra Chat",
    react: <WelcomeEmail orgName={orgName} inboxUrl={appUrl("/inbox")} />,
  });
}

export function sendTeamInviteEmail(
  to: string,
  inviterName: string,
  orgName: string,
  acceptUrl: string,
): Promise<SendResult> {
  return send({
    to,
    subject: `You've been invited to ${orgName} on Xyra Chat`,
    react: <TeamInviteEmail inviterName={inviterName} orgName={orgName} acceptUrl={acceptUrl} />,
  });
}

export function sendTrialEndingEmail(
  to: string,
  orgName: string,
  daysLeft: number,
): Promise<SendResult> {
  // Clamp so a 0/negative day count (trial ends today / already lapsed) doesn't
  // render "0 days" / "-1 days".
  const d = Math.max(1, Math.round(daysLeft));
  return send({
    to,
    subject: `Your Xyra Chat trial ends in ${d} day${d === 1 ? "" : "s"}`,
    react: (
      <TrialEndingEmail orgName={orgName} daysLeft={d} manageUrl={appUrl("/settings/billing")} />
    ),
  });
}

export function sendPaymentFailedEmail(to: string, orgName: string): Promise<SendResult> {
  return send({
    to,
    subject: "Action needed: your Xyra Chat payment failed",
    react: <PaymentFailedEmail orgName={orgName} manageUrl={appUrl("/settings/billing")} />,
  });
}
