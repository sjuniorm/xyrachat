"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rotateChannelToken } from "@/lib/channels/actions";

export function RotateTokenButton({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("channel_id", channelId);
    startTransition(async () => {
      const r = await rotateChannelToken(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Token rotated");
      setToken("");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-white/70 hover:bg-white/5 hover:text-white"
        >
          <KeyRound className="mr-1.5 size-3.5" />
          Rotate token
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10">
        <DialogHeader>
          <DialogTitle>Rotate token for {channelName}</DialogTitle>
          <DialogDescription>
            Generate a fresh access token in Meta (Business Settings → System
            Users for a permanent one, or WhatsApp → API Setup for a temporary
            24-hour one), then paste it here. The new value replaces the secret
            in Supabase Vault — old token stops working immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="access_token">New access token</Label>
            <div className="relative">
              <Input
                id="access_token"
                name="access_token"
                type={show ? "text" : "password"}
                autoComplete="off"
                placeholder="EAA…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-white/60 hover:text-white"
                aria-label={show ? "Hide token" : "Reveal token"}
                tabIndex={-1}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
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
              type="submit"
              disabled={pending || token.trim().length < 20}
              className="xyra-gradient text-white border-0 hover:opacity-90"
            >
              {pending ? "Rotating…" : "Replace token"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
