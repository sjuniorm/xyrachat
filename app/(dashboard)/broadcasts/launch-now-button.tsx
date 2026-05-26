"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function LaunchNowButton({ broadcastId }: { broadcastId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function launch() {
    setBusy(true);
    try {
      const res = await fetch("/api/broadcasts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcastId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; sent?: number; failed?: number; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? "Couldn't launch broadcast.");
        return;
      }
      toast.success(
        `Broadcast launched — ${json.sent ?? 0} sent, ${json.failed ?? 0} failed.`,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={launch}
      className="xyra-gradient text-white border-0 hover:opacity-90"
    >
      <Send className="mr-1 size-3.5" />
      {busy ? "Launching…" : "Launch now"}
    </Button>
  );
}
