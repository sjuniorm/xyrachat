"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFbSdk } from "@/components/meta/use-fb-sdk";

// One-click Messenger connect via Facebook Login for Business. Rendered only
// when NEXT_PUBLIC_META_APP_ID + NEXT_PUBLIC_MESSENGER_OAUTH_CONFIG_ID are set.
export function MessengerLoginButton({ appId, configId }: { appId: string; configId: string }) {
  const router = useRouter();
  const { ready, fb } = useFbSdk(appId);
  const [busy, setBusy] = useState(false);

  function launch() {
    const FB = fb();
    if (!FB) return;
    setBusy(true);
    FB.login(
      (response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          setBusy(false);
          toast.error("Facebook sign-in was cancelled.");
          return;
        }
        fetch("/api/auth/messenger/oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        })
          .then(async (r) => {
            const j = (await r.json().catch(() => null)) as
              | { ok?: boolean; error?: string; pageName?: string; otherPages?: number }
              | null;
            if (!r.ok || !j?.ok) {
              toast.error(j?.error ?? "Couldn't connect Messenger.");
              return;
            }
            toast.success(`Connected ${j.pageName ?? "your Page"}!`);
            if (j.otherPages && j.otherPages > 0) {
              toast.message(`You have ${j.otherPages} more Page(s) — add them manually for now.`);
            }
            router.push("/settings/channels?connected=messenger");
          })
          .catch(() => toast.error("Network error."))
          .finally(() => setBusy(false));
      },
      { config_id: configId, response_type: "code", override_default_response_type: true },
    );
  }

  return (
    <Button
      type="button"
      onClick={launch}
      disabled={!ready || busy}
      className="border-0 bg-[#1877F2] text-white hover:opacity-90"
    >
      <MessagesSquare className="mr-1.5 size-4" />
      {busy ? "Connecting…" : "Continue with Facebook"}
    </Button>
  );
}
