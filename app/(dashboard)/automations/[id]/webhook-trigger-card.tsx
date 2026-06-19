"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

// Shows the inbound URL + shared secret for an external-webhook automation so
// the customer can wire up the external system. The secret authenticates POSTs
// to /api/automations/:id/trigger.
export function WebhookTriggerCard({ automationId, secret }: { automationId: string; secret: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const path = `/api/automations/${automationId}/trigger`;

  function copy(label: string, value: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  return (
    <Card className="mb-8 border-white/10 bg-card/60">
      <CardHeader>
        <CardTitle className="text-base">Webhook trigger</CardTitle>
        <CardDescription>
          POST to this URL from any external system to fire this automation. Send the
          secret as an <code>X-Xyra-Secret</code> header (or <code>?secret=</code>). Identify the
          contact in the JSON body with <code>contact_id</code> or a <code>phone</code>/
          <code>email</code>/<code>instagram_id</code>/<code>telegram_id</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="URL" value={url} copied={copied === "url"} onCopy={() => copy("url", url)} />
        {secret ? (
          <Field label="Secret" value={secret} copied={copied === "secret"} onCopy={() => copy("secret", secret)} mono />
        ) : (
          <p className="text-xs text-amber-300/80">
            No secret set — re-save this automation to generate one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  copied,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-white/50">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`min-w-0 flex-1 truncate rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs ${mono ? "font-mono" : ""}`}>
          {value}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={onCopy} className="shrink-0">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}
