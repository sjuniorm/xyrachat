"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile CAPTCHA widget for the auth forms. Env-gated: renders
// nothing (and reports no token) unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set,
// so dev + un-configured environments keep working. When Supabase CAPTCHA
// enforcement is ON, every auth call must include the token this produces.
//
// Tokens are single-use: after a failed auth attempt, remount this component
// with a new React `key` to get a fresh token (window.turnstile.remove runs in
// cleanup).

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_BASE = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export function isCaptchaEnabled(): boolean {
  return Boolean(SITE_KEY);
}

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || typeof window === "undefined") return;
    let cancelled = false;

    function renderWidget() {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current !== null) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme: "dark",
        callback: (token: string) => onToken(token),
        "error-callback": () => onToken(null),
        "expired-callback": () => onToken(null),
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_BASE}"]`);
      if (existing) {
        existing.addEventListener("load", renderWidget);
      } else {
        const script = document.createElement("script");
        script.src = `${SCRIPT_BASE}?render=explicit`;
        script.async = true;
        script.defer = true;
        script.onload = renderWidget;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // widget already gone
        }
      }
      widgetIdRef.current = null;
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
