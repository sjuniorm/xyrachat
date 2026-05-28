"use client";

import { useState, useTransition } from "react";
import { Plus, Copy, AlertTriangle, Webhook, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EVENT_TYPES } from "@/lib/api/events";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  updateWebhookEndpoint,
} from "@/lib/api/webhook-actions";

type Endpoint = {
  id: string;
  name: string | null;
  url: string;
  events: string[];
  active: boolean;
  source: string;
  consecutive_failures: number;
  last_success_at: string | null;
  created_at: string;
};

export function WebhookEndpointsCard({
  endpoints,
  isAdmin,
}: {
  endpoints: Endpoint[];
  isAdmin: boolean;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Outbound webhooks</CardTitle>
          <CardDescription>
            Get a POST to your URL whenever events happen. HMAC-signed
            with the Stripe-style scheme (<code>t=...,v1=...</code>).
          </CardDescription>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            <Plus className="mr-1 size-3.5" />
            Add endpoint
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {endpoints.length === 0 ? (
          <p className="text-sm text-white/50">No endpoints yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {endpoints.map((e) => (
              <EndpointRow key={e.id} ep={e} isAdmin={isAdmin} />
            ))}
          </ul>
        )}
      </CardContent>
      {creating && <CreateEndpointModal onClose={() => setCreating(false)} />}
    </Card>
  );
}

function EndpointRow({ ep, isAdmin }: { ep: Endpoint; isAdmin: boolean }) {
  const [busy, startTransition] = useTransition();
  const health =
    ep.consecutive_failures >= 5
      ? { label: "Failing", className: "border-red-400/30 bg-red-400/15 text-red-300" }
      : ep.consecutive_failures > 0
        ? { label: "Retrying", className: "border-amber-400/30 bg-amber-400/15 text-amber-300" }
        : { label: "Healthy", className: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" };

  return (
    <li className="flex flex-wrap items-center gap-3 py-3 text-xs">
      <Webhook className="size-3.5 text-white/40" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-white">
            {ep.name || ep.url}
          </span>
          <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${health.className}`}>
            {ep.active ? health.label : "Paused"}
          </Badge>
          <Badge variant="outline" className="h-5 border-white/15 bg-white/5 px-1.5 text-[10px] text-white/70">
            {ep.source}
          </Badge>
        </div>
        <p className="mt-0.5 truncate font-mono text-[10px] text-white/50">{ep.url}</p>
        <p className="mt-0.5 text-[10px] text-white/40">
          {ep.events.length} events · created{" "}
          <span suppressHydrationWarning>{new Date(ep.created_at).toLocaleDateString()}</span>
        </p>
      </div>
      {isAdmin && (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const res = await updateWebhookEndpoint(ep.id, { active: !ep.active });
                if (!res.ok) toast.error(res.error);
                else toast.success(ep.active ? "Paused" : "Resumed");
              })
            }
            className="h-7 border-white/10 bg-white/5 text-[10px] hover:bg-white/10"
          >
            {ep.active ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (!confirm("Delete this endpoint?")) return;
              startTransition(async () => {
                const res = await deleteWebhookEndpoint(ep.id);
                if (!res.ok) toast.error(res.error);
                else toast.success("Endpoint deleted");
              });
            }}
            className="h-7 border-red-400/30 bg-red-400/10 text-[10px] text-red-300 hover:bg-red-400/20"
            aria-label="Delete endpoint"
          >
            <Trash2 className="size-3" />
          </Button>
        </>
      )}
    </li>
  );
}

function CreateEndpointModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>(["message.received"]);
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState<string | null>(null);

  function toggle(e: string) {
    setSelected((cur) =>
      cur.includes(e) ? cur.filter((s) => s !== e) : [...cur, e],
    );
  }

  function submit() {
    if (!url.trim()) return toast.error("Add a URL.");
    if (selected.length === 0) return toast.error("Pick at least one event.");
    startTransition(async () => {
      const res = await createWebhookEndpoint({
        name: name.trim() || undefined,
        url: url.trim(),
        events: selected,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSecret(res.data!.secret);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        {!secret ? (
          <>
            <h2 className="text-base font-semibold text-white">New webhook endpoint</h2>
            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="ep-name" className="text-xs">Name (optional)</Label>
                <Input
                  id="ep-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CRM sync"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ep-url" className="text-xs">URL</Label>
                <Input
                  id="ep-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-server.com/xyra"
                  className="mt-1"
                />
                <p className="mt-1 text-[10px] text-white/40">
                  HTTPS only in production. Private IPs are blocked.
                </p>
              </div>
              <div>
                <Label className="text-xs">Events</Label>
                <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-white/10 bg-white/[0.02] p-2">
                  {EVENT_TYPES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => toggle(e)}
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                        selected.includes(e)
                          ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/15 text-white"
                          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="border-white/10 bg-white/5 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                disabled={pending}
                onClick={submit}
                className="xyra-gradient text-white border-0 hover:opacity-90"
              >
                {pending ? "Creating…" : "Create endpoint"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-white">Endpoint signing secret</h2>
            <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/5 p-2 text-[11px] text-red-200">
              <AlertTriangle className="mr-1 inline size-3" />
              Copy this now. Use it to verify the HMAC on every webhook delivery.
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/30 p-3">
              <code className="flex-1 break-all font-mono text-[12px] text-white">{secret}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(secret);
                  toast.success("Copied");
                }}
                className="border-white/10 bg-white/5 hover:bg-white/10"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-white/60">
              Signature header: <code>X-Xyra-Signature: t=&lt;ts&gt;,v1=&lt;hmac&gt;</code> where{" "}
              <code>hmac = HMAC-SHA256(secret, &quot;${"{ts}"}.${"{rawBody}"}&quot;)</code> in hex.
            </p>
            <div className="mt-5 flex justify-end">
              <Button
                onClick={onClose}
                className="xyra-gradient text-white border-0 hover:opacity-90"
              >
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
