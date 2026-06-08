import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Always-safe security headers (enforced) + a Content-Security-Policy shipped in
// REPORT-ONLY mode. Report-only never blocks a resource — it just POSTs
// violations to /api/security/csp-report (→ Sentry) so we can confirm the
// allow-list is complete on real traffic BEFORE flipping it to enforced. This
// avoids silently breaking PostHog / Stripe / Supabase / Sentry in prod.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Next.js + React inject inline scripts; Stripe.js + PostHog load externally.
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.posthog.com https://cdn.jsdelivr.net https://unpkg.com https://canny.io",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Supabase REST + realtime (wss), Stripe API, PostHog (EU), Sentry ingest, Canny.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://api.stripe.com https://*.ingest.sentry.io https://*.sentry.io https://canny.io",
  "frame-src https://js.stripe.com https://canny.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/security/csp-report",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

// Sentry wraps the build for error tracking + (optional) source-map upload.
// Source maps only upload when SENTRY_AUTH_TOKEN + org/project are set
// (CI/release); locally + without them it's a no-op, so this is build-safe
// before a Sentry project exists.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
