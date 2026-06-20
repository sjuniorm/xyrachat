"use client";

import { useEffect } from "react";
import { initPostHogBrowser } from "@/lib/analytics";

const CONSENT_KEY = "xyra.cookie-consent";

// GDPR consent gate. `consentRequired` is true for EEA visitors (computed from
// geo in the root layout). For them, PostHog must NOT load (no cookies, no
// capture) until they explicitly Accept — the cookie banner dispatches
// `xyra:consent-accepted` when they do. Non-EEA visitors load normally unless
// they've explicitly rejected. Previously this called initPostHogBrowser()
// unconditionally, which loaded analytics for EEA visitors before consent.
export function PostHogProvider({
  children,
  consentRequired = false,
}: {
  children: React.ReactNode;
  consentRequired?: boolean;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const consent = window.localStorage.getItem(CONSENT_KEY);

    if (consentRequired) {
      // EEA: load only after an explicit Accept (now, or via the banner event).
      if (consent === "accepted") {
        initPostHogBrowser();
        return;
      }
      const onAccept = () => initPostHogBrowser();
      window.addEventListener("xyra:consent-accepted", onAccept);
      return () => window.removeEventListener("xyra:consent-accepted", onAccept);
    }

    // Non-EEA: load unless explicitly rejected.
    if (consent !== "rejected") initPostHogBrowser();
  }, [consentRequired]);

  return <>{children}</>;
}
