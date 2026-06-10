"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFbSdk } from "@/components/meta/use-fb-sdk";

// One-click WhatsApp connect via Meta's Embedded Signup. Only rendered when
// NEXT_PUBLIC_META_APP_ID + NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID are set, so it's
// inert until the Meta app is configured (the manual form stays the fallback).
export function EmbeddedSignupButton({ appId, configId }: { appId: string; configId: string }) {
  const router = useRouter();
  const { ready, fb } = useFbSdk(appId);
  const [busy, setBusy] = useState(false);
  // Meta posts phone_number_id + waba_id via a window message during the flow.
  const session = useRef<{ phone_number_id?: string; waba_id?: string }>({});

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!/^https:\/\/(www|web)\.facebook\.com$/.test(e.origin)) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.data) {
          session.current = {
            phone_number_id: data.data.phone_number_id,
            waba_id: data.data.waba_id,
          };
        }
      } catch {
        /* ignore non-JSON frames */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function launch() {
    const FB = fb();
    if (!FB) return;
    setBusy(true);
    FB.login(
      (response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          setBusy(false);
          toast.error("WhatsApp signup was cancelled.");
          return;
        }
        fetch("/api/auth/whatsapp/embedded-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            phoneNumberId: session.current.phone_number_id,
            wabaId: session.current.waba_id,
          }),
        })
          .then(async (r) => {
            const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
            if (!r.ok || !j?.ok) {
              toast.error(j?.error ?? "Couldn't connect WhatsApp.");
              return;
            }
            toast.success("WhatsApp connected!");
            router.push("/settings/channels?connected=whatsapp");
          })
          .catch(() => toast.error("Network error."))
          .finally(() => setBusy(false));
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    );
  }

  return (
    <Button
      type="button"
      onClick={launch}
      disabled={!ready || busy}
      className="border-0 bg-[#25D366] text-white hover:opacity-90"
    >
      <MessageCircle className="mr-1.5 size-4" />
      {busy ? "Connecting…" : "Connect with WhatsApp"}
    </Button>
  );
}
