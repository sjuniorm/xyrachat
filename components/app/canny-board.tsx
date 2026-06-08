"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Lightbulb, Mail } from "lucide-react";

const APP_ID = process.env.NEXT_PUBLIC_CANNY_APP_ID;
const BOARD_TOKEN = process.env.NEXT_PUBLIC_CANNY_BOARD_TOKEN;

// Embeds the Canny roadmap/feature-request board, identifying the signed-in user
// via an SSO token from /api/canny/sso (so they can post + vote without a
// separate Canny account). Shows a clean placeholder until Canny env is set.
declare global {
  interface Window {
    Canny?: (...args: unknown[]) => void;
  }
}

export function CannyBoard() {
  const [ready, setReady] = useState(false);
  const configured = Boolean(APP_ID && BOARD_TOKEN);

  useEffect(() => {
    if (!configured || !ready || !window.Canny) return;
    let cancelled = false;
    (async () => {
      let ssoToken: string | undefined;
      try {
        const res = await fetch("/api/canny/sso");
        const data = (await res.json().catch(() => null)) as
          | { configured?: boolean; token?: string }
          | null;
        if (data?.configured && data.token) ssoToken = data.token;
      } catch {
        /* render the board read-only if SSO fails */
      }
      if (cancelled || !window.Canny) return;
      window.Canny("render", {
        boardToken: BOARD_TOKEN,
        basePath: "/roadmap",
        ssoToken,
        theme: "dark",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, ready]);

  if (!configured) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
        <Lightbulb className="mx-auto size-8 text-[color:var(--xyra-glow)]" />
        <h2 className="mt-3 text-lg font-medium text-white">Roadmap coming soon</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
          We&apos;re setting up a public roadmap where you&apos;ll be able to
          submit ideas and vote on what we build next. In the meantime, send your
          feature requests our way.
        </p>
        <a
          href="mailto:support@xyrachat.com?subject=Feature%20request"
          className="mt-5 inline-flex items-center gap-2 rounded-lg xyra-gradient px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Mail className="size-4" />
          Email a feature request
        </a>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://canny.io/sdk.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div data-canny />
    </>
  );
}
