import * as Sentry from "@sentry/nextjs";

// Edge-runtime error tracking (middleware, edge routes). Inert until the DSN
// is set.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
