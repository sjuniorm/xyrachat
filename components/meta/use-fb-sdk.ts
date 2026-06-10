"use client";

import { useEffect, useState } from "react";

export type FbLoginResponse = { authResponse?: { code?: string } | null };
type FB = {
  init: (o: Record<string, unknown>) => void;
  login: (cb: (r: FbLoginResponse) => void, o: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FB;
    fbAsyncInit?: () => void;
  }
}

// Loads Meta's Facebook JS SDK once (shared by the WhatsApp Embedded Signup +
// Messenger Login buttons) and inits it with the given app id. Returns `ready`
// + an `fb()` accessor. No-op cleanup; the SDK script stays cached on the page.
export function useFbSdk(appId: string): { ready: boolean; fb: () => FB | undefined } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.FB) {
      setReady(true);
      return;
    }
    if (!document.getElementById("fb-sdk")) {
      window.fbAsyncInit = () => {
        window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v22.0" });
        setReady(true);
      };
      const s = document.createElement("script");
      s.id = "fb-sdk";
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(s);
    }
  }, [appId]);

  return { ready, fb: () => window.FB };
}
