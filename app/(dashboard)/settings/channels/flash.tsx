"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Surfaces ?connected=… and ?error=… query params from the OAuth callback as
// toasts, then strips them from the URL so a refresh doesn't replay.
export function ChannelsFlash({
  connected,
  error,
}: {
  connected?: string;
  error?: string;
}) {
  const router = useRouter();
  useEffect(() => {
    if (connected === "instagram") {
      toast.success("Instagram channel connected.");
    } else if (error) {
      toast.error(error);
    }
    if (connected || error) {
      router.replace("/settings/channels", { scroll: false });
    }
  }, [connected, error, router]);
  return null;
}
