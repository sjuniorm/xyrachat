"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Surfaces ?connected=… and ?error=… query params from the OAuth callback as
// toasts, then strips them from the URL so a refresh doesn't replay.
export function ChannelsFlash({
  connected,
  error,
  warn,
}: {
  connected?: string;
  error?: string;
  warn?: string;
}) {
  const router = useRouter();
  useEffect(() => {
    if (warn === "webhooks-unsubscribed") {
      // The channel saved, but Meta wouldn't subscribe it to webhooks — so DMs
      // won't arrive. Warn instead of the misleading green "connected!" success.
      toast.warning(
        "Channel saved, but we couldn't subscribe it to Instagram webhooks — DMs may not arrive yet. Check the token/permissions (in dev mode the account must be an Instagram Tester), then rotate the token to retry.",
      );
    } else if (connected === "instagram") {
      toast.success("Instagram channel connected.");
    } else if (connected === "telegram") {
      toast.success("Telegram bot connected.");
    } else if (connected === "email") {
      toast.success("Email channel ready.");
    } else if (connected === "messenger") {
      toast.success("Facebook Messenger connected.");
    } else if (error) {
      toast.error(error);
    }
    if (connected || error || warn) {
      router.replace("/settings/channels", { scroll: false });
    }
  }, [connected, error, warn, router]);
  return null;
}
