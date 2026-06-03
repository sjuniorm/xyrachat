import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactCompiler: true,
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
  disableLogger: true,
});
