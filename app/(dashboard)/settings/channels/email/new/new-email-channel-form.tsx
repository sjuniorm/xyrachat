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

type ActionResult = { error?: string } | undefined;

export function NewEmailChannelForm({
  action,
  domain,
  suggestedLocal,
  resendConfigured,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  domain: string;
  suggestedLocal: string;
  resendConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(suggestedLocal);
  const fullAddress = `${local || "inbox"}@${domain}`;
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

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
      {!resendConfigured && (
        <Card className="border-amber-400/30 bg-amber-400/5">
          <CardHeader>
            <CardTitle className="text-base">Resend not configured</CardTitle>
            <CardDescription>
              Set <code>RESEND_API_KEY</code> and <code>RESEND_WEBHOOK_SECRET</code>
              in Vercel before clients send to this address. You can still
              create the channel below to claim the address — emails just
              won&apos;t land until those envs are set.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Pick your inbox address</CardTitle>
          <CardDescription>
            Customers email this address. Replies from Xyra go back to whoever
            wrote in, threaded as a normal email conversation.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Channel name (your label)</Label>
              <Input
                id="name"
                name="name"
                placeholder="Support inbox"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inbox_local">Inbox prefix</Label>
              <div className="flex items-stretch overflow-hidden rounded-md border border-white/10 bg-white/5 focus-within:border-[color:var(--xyra-glow)]">
                <Input
                  id="inbox_local"
                  name="inbox_local"
                  value={local}
                  onChange={(e) => setLocal(e.target.value.toLowerCase())}
                  placeholder="support"
                  required
                  className="rounded-none border-0 bg-transparent"
                />
                <span className="flex items-center bg-white/5 px-3 text-xs text-white/60 border-l border-white/10">
                  @{domain}
                </span>
              </div>
              <p className="text-[11px] text-white/50">
                Allowed: a-z, 0-9, dot, dash, underscore. Must be unique
                across all Xyra workspaces.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="from_name">From name (optional)</Label>
              <Input
                id="from_name"
                name="from_name"
                placeholder="Xyra Support"
              />
              <p className="text-[11px] text-white/50">
                Shown as the sender name on outbound emails. Defaults to
                &ldquo;Xyra Chat&rdquo;.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Preview</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-mono text-white/90">
                  {fullAddress}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyAddress}
                  className="h-8 shrink-0 border-white/10 px-2"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
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
              {pending ? "Creating…" : "Create email channel"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">After you create it</CardTitle>
          <CardDescription>Two ways customers reach you:</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-white">A. Use it directly</p>
            <p className="text-white/60">
              Hand out <code>{fullAddress}</code> as your support address.
              Anyone who emails it lands in your Xyra inbox.
            </p>
          </div>
          <div>
            <p className="font-medium text-white">B. Forward your existing address</p>
            <p className="text-white/60">
              In Google Workspace / Outlook / etc., set up forwarding from{" "}
              <code>support@yourdomain.com</code> →{" "}
              <code>{fullAddress}</code>. Customers keep emailing your old
              address — replies still come from Xyra.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
