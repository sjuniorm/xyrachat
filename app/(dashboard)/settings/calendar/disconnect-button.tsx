"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectCalendar } from "@/lib/calendar/actions";

export function CalendarDisconnectButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const res = await disconnectCalendar(connectionId);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Calendar disconnected.");
          router.refresh();
        })
      }
      className="border-rose-400/30 text-rose-200 hover:bg-rose-400/10"
    >
      {busy ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
