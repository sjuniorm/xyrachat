"use client";

import { useState, useTransition } from "react";
import { Unplug } from "lucide-react";
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
import { disconnectChannel } from "@/lib/channels/actions";

const PROVIDER_NOTE: Record<string, string> = {
  whatsapp:
    "Meta still has your phone number on file — to clean up there, remove the webhook + revoke the access token in Meta App Dashboard.",
  instagram:
    "Meta will keep the Instagram authorization until you revoke it from instagram.com/accounts/manage_access/. Reconnecting later requires re-authorization either way.",
  telegram:
    "We'll call deleteWebhook on Telegram so the bot stops sending us updates. The bot itself stays alive — you can reconnect with the same or a fresh token later.",
  email:
    "The inbox address is freed so another channel can claim it. Resend still has the inbound subscription configured at the platform level — no action needed there.",
};

export function DisconnectChannelButton({
  channelId,
  channelName,
  channelType,
}: {
  channelId: string;
  channelName: string;
  channelType: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    const fd = new FormData();
    fd.set("channel_id", channelId);
    startTransition(async () => {
      const r = await disconnectChannel(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Channel disconnected");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-white/70 hover:bg-red-500/10 hover:text-red-300"
        >
          <Unplug className="mr-1.5 size-3.5" />
          Disconnect
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10">
        <DialogHeader>
          <DialogTitle>Disconnect {channelName}?</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              The channel stops receiving new messages immediately. Existing
              conversations stay in the inbox for history, but you can&apos;t
              reply on them.
            </span>
            <span className="block text-xs text-white/60">
              {PROVIDER_NOTE[channelType] ??
                "Provider-side cleanup may be required — check your provider dashboard."}
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="bg-red-500 text-white hover:bg-red-500/90 border-0"
          >
            {pending ? "Disconnecting…" : "Disconnect channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
