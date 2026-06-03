"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelBroadcast } from "@/lib/broadcasts/actions";

export function CancelBroadcastButton({
  broadcastId,
  sending = false,
}: {
  broadcastId: string;
  sending?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await cancelBroadcast(broadcastId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(sending ? "Stopping broadcast…" : "Broadcast cancelled");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-white/15 text-white/80 hover:bg-white/5"
        >
          <Ban className="mr-1 size-3.5" />
          {sending ? "Stop" : "Cancel"}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10">
        <DialogHeader>
          <DialogTitle>
            {sending ? "Stop this broadcast?" : "Cancel this broadcast?"}
          </DialogTitle>
          <DialogDescription>
            {sending
              ? "Messages already sent can't be recalled — remaining recipients won't receive it. It may take a few seconds to stop."
              : "This broadcast won't be sent. You can't undo this, but you can create a new one from the same template."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Keep it
          </Button>
          <Button
            type="button"
            onClick={run}
            disabled={pending}
            className="bg-red-500 text-white hover:bg-red-500/90 border-0"
          >
            {pending
              ? "Working…"
              : sending
                ? "Stop sending"
                : "Cancel broadcast"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
