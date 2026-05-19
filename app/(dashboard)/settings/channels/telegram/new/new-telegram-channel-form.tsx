"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
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

type ActionResult = { error?: string } | undefined;

export function NewTelegramChannelForm({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [showToken, setShowToken] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">How to get a bot token</CardTitle>
          <CardDescription>
            On Telegram, message{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-white"
            >
              @BotFather
            </a>{" "}
            with <code>/newbot</code> → follow the prompts → copy the token it
            gives you. Paste it below.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Bot details</CardTitle>
          <CardDescription>
            On save we&apos;ll call <code>setWebhook</code> + <code>getMe</code> on
            Telegram&apos;s API so the bot starts forwarding messages here
            immediately.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Channel name (your label)</Label>
              <Input
                id="name"
                name="name"
                placeholder="Support bot"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bot_token">Bot token</Label>
              <div className="relative">
                <Input
                  id="bot_token"
                  name="bot_token"
                  type={showToken ? "text" : "password"}
                  autoComplete="off"
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsT_UvWxYz"
                  required
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-white/60 hover:text-white"
                  aria-label={showToken ? "Hide token" : "Reveal token"}
                  tabIndex={-1}
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-[11px] text-white/50">
                Stored encrypted in Supabase Vault. The bot keeps working as
                long as you don&apos;t regenerate the token from BotFather.
              </p>
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
              {pending ? "Connecting…" : "Connect bot"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
