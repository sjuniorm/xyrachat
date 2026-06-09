"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionResult = { error?: string; publicKey?: string };

export function NewWebchatChannelForm({
  action,
  appOrigin,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  appOrigin: string;
}) {
  const [pending, startTransition] = useTransition();
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const snippet = publicKey
    ? `<script src="${appOrigin}/api/webchat/widget?k=${publicKey}" async></script>`
    : "";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await action(fd);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      if (r.publicKey) setPublicKey(r.publicKey);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

  if (publicKey) {
    return (
      <Card className="border-emerald-400/30 bg-emerald-400/5">
        <CardHeader>
          <CardTitle className="text-base">Widget ready 🎉</CardTitle>
          <CardDescription>
            Paste this snippet just before the closing <code>&lt;/body&gt;</code>{" "}
            tag on every page of your website. The chat bubble appears bottom-right;
            messages flow straight into your inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2">
            <pre className="flex-1 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white/90">
              <code>{snippet}</code>
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copy}
              className="shrink-0 border-white/10"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
          <p className="text-[11px] text-white/50">
            Tip: test it by opening your site, sending a message, and watching it
            appear in the inbox. Assign a bot to this channel to auto-answer.
          </p>
          <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
            <Button asChild className="xyra-gradient text-white border-0 hover:opacity-90">
              <a href="/settings/channels">Done</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader>
        <CardTitle className="text-base">Widget settings</CardTitle>
        <CardDescription>Name it, style it, then copy the embed snippet.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Channel name (internal)</Label>
            <Input id="name" name="name" placeholder="Website chat" required autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Header title</Label>
              <Input id="title" name="title" placeholder="Chat with us" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="launcher_text">Bubble label</Label>
              <Input id="launcher_text" name="launcher_text" placeholder="Chat" maxLength={24} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="greeting">Greeting message</Label>
            <Input
              id="greeting"
              name="greeting"
              placeholder="Hi! 👋 How can we help?"
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="color">Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                id="color"
                name="color"
                type="color"
                defaultValue="#9333EA"
                className="h-9 w-14 cursor-pointer rounded border border-white/10 bg-transparent"
              />
              <span className="text-xs text-white/50">Matches your brand</span>
            </div>
          </div>
        </CardContent>
        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-6 py-4">
          <Button type="button" variant="ghost" asChild disabled={pending}>
            <a href="/settings/channels">Cancel</a>
          </Button>
          <Button
            type="submit"
            disabled={pending}
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            {pending ? "Creating…" : "Create widget"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
