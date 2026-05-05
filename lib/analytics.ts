// Xyra Chat — browser analytics layer (PostHog, EU host).
// Customer message contents must NEVER reach PostHog. Session recording is
// disabled globally (option a in spec section 9). Re-enable later only with
// `maskAllInputs: true` and composer/bubble masking.
//
// This file is safe to import from "use client" components. For server-side
// tracking (route handlers, server actions, webhooks) use `lib/analytics-server.ts`.

import posthog from "posthog-js";

export type AnalyticsEvent =
  | "signup"
  | "org_created"
  | "channel_connected"
  | "message_sent"
  | "bot_created"
  | "broadcast_sent"
  | "upgrade_clicked";

export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let browserInitialised = false;

export function initPostHogBrowser() {
  if (typeof window === "undefined") return;
  if (browserInitialised) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // No-op in environments without a key.

  posthog.init(key, {
    api_host: POSTHOG_HOST,
    capture_pageview: "history_change",
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    // GDPR — no session recording. Customer message content must never leak.
    disable_session_recording: true,
    session_recording: { recordCrossOriginIframes: false },
    // We identify users explicitly so we don't need autocapture.
    autocapture: false,
  });
  browserInitialised = true;
}

export function identify(
  userId: string,
  props: { org_id?: string | null; plan?: string | null; email?: string | null } = {},
) {
  if (typeof window === "undefined") return;
  if (!browserInitialised) initPostHogBrowser();
  posthog.identify(userId, props);
}

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (!browserInitialised) initPostHogBrowser();
  posthog.capture(event, props);
}

export function resetAnalytics() {
  if (typeof window === "undefined") return;
  posthog.reset();
}
