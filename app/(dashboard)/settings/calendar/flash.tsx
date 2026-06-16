"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Surfaces ?connected=… / ?error=… from the OAuth callback as a one-time toast,
// then strips them from the URL so the message doesn't stick on reload.
export function CalendarFlash({ connected, error }: { connected?: string; error?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (connected) {
      toast.success(`${connected === "google" ? "Google Calendar" : "Outlook"} connected.`);
    } else if (error) {
      toast.error(
        error === "not_configured"
          ? "That calendar isn't enabled yet (operator setup pending)."
          : error === "forbidden"
            ? "Owners/admins only."
            : `Couldn't connect: ${error}`,
      );
    }
    if (connected || error) {
      router.replace("/settings/calendar", { scroll: false });
    }
  }, [connected, error, router]);
  return null;
}
