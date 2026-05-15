"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
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
          {value || "(set INSTAGRAM_WEBHOOK_VERIFY_TOKEN in env)"}
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

export function NewInstagramChannelForm({
  action,
  webhookUrl,
  verifyToken,
  oauthAvailable,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  webhookUrl: string;
  verifyToken: string;
  oauthAvailable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [showToken, setShowToken] = useState(false);
  const [showManual, setShowManual] = useState(false);

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
      {oauthAvailable && (
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">One-click connect</CardTitle>
            <CardDescription>
              Sign in with the Instagram Business account you want to manage
              from Xyra. We&apos;ll pull the credentials automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              className="text-white border-0 bg-[linear-gradient(135deg,#833AB4_0%,#FD1D1D_50%,#FCB045_100%)] hover:opacity-90"
            >
              <a href="/api/auth/instagram/start">
                <span className="mr-2 inline-flex size-4 items-center justify-center rounded-sm bg-white text-[10px] font-bold text-[#E1306C]">
                  IG
                </span>
                Continue with Instagram
              </a>
            </Button>
            <p className="mt-3 text-xs text-white/50">
              You&apos;ll be redirected to Instagram to authorize Xyra Chat.
              Required scopes: <code>instagram_business_basic</code>,{" "}
              <code>instagram_business_manage_messages</code>,{" "}
              <code>instagram_business_manage_comments</code>.
            </p>
          </CardContent>
        </Card>
      )}

      {!oauthAvailable && (
        <Card className="border-amber-400/30 bg-amber-400/5">
          <CardHeader>
            <CardTitle className="text-base">Manual setup only (for now)</CardTitle>
            <CardDescription>
              One-click connect needs <code>INSTAGRAM_APP_ID</code> set in your
              environment. Until then, paste credentials below.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="text-center">
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-xs text-white/60 underline hover:text-white"
        >
          {showManual ? "Hide manual entry" : "Or paste credentials manually"}
        </button>
      </div>

      {showManual && (
        <>
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">1 — Paste these into Meta</CardTitle>
              <CardDescription>
                Meta App Dashboard → Webhooks → Instagram → Subscribe. Use these
                two values, then click <em>Verify and save</em>.
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
                Found via Graph API Explorer or the Meta Business Suite.
                You need the linked Facebook Page ID, the Instagram Business
                Account ID, and a long-lived Page access token.
              </CardDescription>
            </CardHeader>
            <form onSubmit={onSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Channel name (your label)</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="@xyrachat"
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ig_username">Instagram username (optional)</Label>
                  <Input
                    id="ig_username"
                    name="ig_username"
                    placeholder="xyrachat"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="page_id">
                    Facebook Page ID{" "}
                    <span className="text-white/40">(optional)</span>
                  </Label>
                  <Input
                    id="page_id"
                    name="page_id"
                    placeholder="Leave blank for Instagram-direct connections"
                    inputMode="numeric"
                  />
                  <p className="text-[11px] text-white/50">
                    Only fill this in if your Instagram is linked to a
                    Facebook Page and you have a Page access token. For
                    Instagram Business Login (no Page), leave blank.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ig_business_account_id">
                    Instagram Business Account ID
                  </Label>
                  <Input
                    id="ig_business_account_id"
                    name="ig_business_account_id"
                    placeholder="17841400000000000"
                    inputMode="numeric"
                    required
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
                    Stored encrypted in Supabase Vault. Only the vault UUID is
                    saved in the channels table.
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
        </>
      )}
    </div>
  );
}
