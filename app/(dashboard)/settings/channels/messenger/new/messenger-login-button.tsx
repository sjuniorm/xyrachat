"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFbSdk } from "@/components/meta/use-fb-sdk";

// One-click Messenger connect via Facebook Login for Business. Rendered only
// when NEXT_PUBLIC_META_APP_ID + NEXT_PUBLIC_MESSENGER_OAUTH_CONFIG_ID are set.
// When the account has multiple Pages the route returns a list to choose from;
// picking one re-runs FB.login (fresh code) and posts back the chosen pageId.
type Page = { id: string; name: string };

export function MessengerLoginButton({ appId, configId }: { appId: string; configId: string }) {
  const router = useRouter();
  const { ready, fb } = useFbSdk(appId);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<Page[] | null>(null);

  // FB.login → fresh auth code → POST to our route with an optional chosen
  // pageId. The code is single-use, so picking a Page re-runs login for a new
  // one rather than caching the user token server-side.
  function run(pageId?: string) {
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
          body: JSON.stringify({ code, pageId }),
        })
          .then(async (r) => {
            const j = (await r.json().catch(() => null)) as
              | { ok?: boolean; error?: string; pageName?: string; needsChoice?: boolean; pages?: Page[] }
              | null;
            // Multiple Pages → show the chooser instead of auto-connecting.
            if (r.ok && j?.needsChoice && j.pages?.length) {
              setPages(j.pages);
              return;
            }
            if (!r.ok || !j?.ok) {
              toast.error(j?.error ?? "Couldn't connect Messenger.");
              return;
            }
            toast.success(`Connected ${j.pageName ?? "your Page"}!`);
            router.push("/settings/channels?connected=messenger");
          })
          .catch(() => toast.error("Network error."))
          .finally(() => setBusy(false));
      },
      { config_id: configId, response_type: "code", override_default_response_type: true },
    );
  }

  if (pages) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-white/70">Choose the Facebook Page to connect:</p>
        <div className="flex flex-col gap-1.5">
          {pages.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => run(p.id)}
              className="justify-start border-white/10"
            >
              <MessagesSquare className="mr-1.5 size-4" />
              {p.name}
            </Button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPages(null)}
          className="text-xs text-white/50 hover:text-white"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => run()}
      disabled={!ready || busy}
      className="border-0 bg-[#1877F2] text-white hover:opacity-90"
    >
      <MessagesSquare className="mr-1.5 size-4" />
      {busy ? "Connecting…" : "Continue with Facebook"}
    </Button>
  );
}
