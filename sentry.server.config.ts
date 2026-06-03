import * as Sentry from "@sentry/nextjs";

// Server-side error tracking. Inert until NEXT_PUBLIC_SENTRY_DSN is set, so
// this is safe to ship before a Sentry project exists.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  // GDPR: never attach PII (IPs, user data) to events. Customer message
  // contents must never reach Sentry — mirrors the PostHog no-recording stance.
  sendDefaultPii: false,
});
