"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ActionResult = { error?: string } | undefined;

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-white/60">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-mono text-white/90">
          {value || "(set WHATSAPP_WEBHOOK_VERIFY_TOKEN in env)"}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copy}
          disabled={!value}
          className="h-8 shrink-0 border-white/10 px-2"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export function NewChannelForm({
  action,
  webhookUrl,
  verifyToken,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  webhookUrl: string;
  verifyToken: string;
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
          <CardTitle className="text-base">1 — Paste these into Meta</CardTitle>
          <CardDescription>
            Meta App Dashboard → WhatsApp → Configuration → Webhook. Use these two
            values, then click <em>Verify and save</em> on Meta's side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyField label="Callback URL" value={webhookUrl} />
          <CopyField label="Verify token" value={verifyToken} />
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">2 — Channel credentials</CardTitle>
          <CardDescription>
            Found in Meta App Dashboard → WhatsApp → API Setup. Use a permanent
            System User token, not the temporary dashboard token.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Channel name (your label)</Label>
              <Input
                id="name"
                name="name"
                placeholder="Main WhatsApp"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone_number_id">Phone Number ID</Label>
              <Input
                id="phone_number_id"
                name="phone_number_id"
                placeholder="123456789012345"
                inputMode="numeric"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="waba_id">WhatsApp Business Account ID (optional)</Label>
              <Input
                id="waba_id"
                name="waba_id"
                placeholder="123456789012345"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="access_token">Access token</Label>
              <div className="relative">
                <Input
                  id="access_token"
                  name="access_token"
                  type={showToken ? "text" : "password"}
                  autoComplete="off"
                  placeholder="EAA…"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-white/60 hover:text-white"
                  aria-label={showToken ? "Hide token" : "Reveal token"}
                  tabIndex={-1}
                >
                  {showToken ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <p className={cn("text-[11px] text-white/50")}>
                Stored encrypted in Supabase Vault. Only the vault UUID is saved
                in the channels table.
              </p>
            </div>
          </CardContent>
          <div className="flex items-center justify-end gap-2 border-t border-white/5 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              asChild
              disabled={pending}
            >
              <a href="/settings/channels">Cancel</a>
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="xyra-gradient text-white border-0 hover:opacity-90"
            >
              {pending ? "Connecting…" : "Connect channel"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
