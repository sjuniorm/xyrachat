"use client";

import { useState, useTransition } from "react";
import { Plus, Copy, AlertTriangle, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SCOPES } from "@/lib/api/scopes";
import { createApiKey, revokeApiKey, deleteApiKey } from "@/lib/api/key-actions";

type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  created_at: string;
};

const SCOPE_GROUPS: Array<{ label: string; scopes: string[] }> = [
  { label: "Contacts", scopes: ["contacts:read", "contacts:write"] },
  { label: "Conversations", scopes: ["conversations:read", "conversations:write"] },
  { label: "Messages", scopes: ["messages:read", "messages:write"] },
  { label: "Channels", scopes: ["channels:read"] },
  { label: "Bots", scopes: ["bots:read", "bots:write"] },
  { label: "Templates", scopes: ["templates:read"] },
  { label: "Broadcasts", scopes: ["broadcasts:read", "broadcasts:write"] },
  { label: "Automations", scopes: ["automations:read", "automations:write"] },
  { label: "Webhooks", scopes: ["webhooks:read", "webhooks:write"] },
  { label: "Outcomes", scopes: ["outcomes:read"] },
];

export function ApiKeysCard({ keys, isAdmin }: { keys: KeyRow[]; isAdmin: boolean }) {
  const [creating, setCreating] = useState(false);
  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">API keys</CardTitle>
          <CardDescription>
            Bearer tokens with per-scope permissions. Keep them secret — the
            plaintext is shown only once at creation.
          </CardDescription>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            <Plus className="mr-1 size-3.5" />
            New key
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {keys.length === 0 ? (
          <p className="text-sm text-white/50">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {keys.map((k) => (
              <KeyRow key={k.id} k={k} isAdmin={isAdmin} />
            ))}
          </ul>
        )}
      </CardContent>
      {creating && (
        <CreateKeyModal onClose={() => setCreating(false)} />
      )}
    </Card>
  );
}

function KeyRow({ k, isAdmin }: { k: KeyRow; isAdmin: boolean }) {
  const [busy, startTransition] = useTransition();
  const isExpired = k.expires_at && new Date(k.expires_at).getTime() <= Date.now();
  const status = k.revoked_at
    ? { label: "Revoked", className: "border-red-400/30 bg-red-400/15 text-red-300" }
    : isExpired
      ? { label: "Expired", className: "border-zinc-500/30 bg-zinc-500/20 text-zinc-300" }
      : { label: "Active", className: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" };

  return (
    <li className="flex flex-wrap items-center gap-3 py-3 text-xs">
      <KeyRound className="size-3.5 text-white/40" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{k.name}</span>
          <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${status.className}`}>
            {status.label}
          </Badge>
        </div>
        <p className="mt-0.5 font-mono text-[10px] text-white/50">
          {k.key_prefix}…
        </p>
        <p className="mt-0.5 text-[10px] text-white/40">
          {k.scopes.length} scopes · created{" "}
          <span suppressHydrationWarning>{new Date(k.created_at).toLocaleDateString()}</span>
          {k.last_used_at ? (
            <>
              {" · "}last used{" "}
              <span suppressHydrationWarning>
                {new Date(k.last_used_at).toLocaleString()}
              </span>
            </>
          ) : null}
        </p>
      </div>
      {isAdmin && !k.revoked_at && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const res = await revokeApiKey(k.id);
              if (!res.ok) toast.error(res.error);
              else toast.success("Key revoked");
            })
          }
          className="h-7 border-amber-400/30 bg-amber-400/10 text-[10px] text-amber-200 hover:bg-amber-400/20"
        >
          Revoke
        </Button>
      )}
      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            if (!confirm("Delete this key forever? Revoke first if you only want to disable it.")) return;
            startTransition(async () => {
              const res = await deleteApiKey(k.id);
              if (!res.ok) toast.error(res.error);
              else toast.success("Key deleted");
            });
          }}
          className="h-7 border-red-400/30 bg-red-400/10 text-[10px] text-red-300 hover:bg-red-400/20"
          aria-label="Delete key"
        >
          <Trash2 className="size-3" />
        </Button>
      )}
    </li>
  );
}

function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(["contacts:read", "messages:write"]);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [plaintext, setPlaintext] = useState<string | null>(null);

  function toggle(scope: string) {
    setSelected((cur) =>
      cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope],
    );
  }

  function submit() {
    if (!name.trim()) return toast.error("Give the key a name.");
    if (selected.length === 0) return toast.error("Pick at least one scope.");
    startTransition(async () => {
      const res = await createApiKey({
        name,
        scopes: selected,
        expiresInDays,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPlaintext(res.data!.plaintext);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        {!plaintext ? (
          <>
            <h2 className="text-base font-semibold text-white">New API key</h2>
            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="key-name" className="text-xs">Name</Label>
                <Input
                  id="key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Make.com production"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Scopes</Label>
                <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-white/10 bg-white/[0.02] p-2">
                  {SCOPE_GROUPS.map((g) => (
                    <div key={g.label} className="mb-2">
                      <p className="text-[10px] uppercase tracking-wide text-white/40">
                        {g.label}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {g.scopes.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggle(s)}
                            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                              selected.includes(s)
                                ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/15 text-white"
                                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-white/40">Admin</p>
                    <button
                      type="button"
                      onClick={() => toggle("admin")}
                      className={`mt-1 rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                        selected.includes("admin")
                          ? "border-red-400/40 bg-red-400/10 text-red-200"
                          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      admin (grants everything)
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Expiry</Label>
                <select
                  value={expiresInDays ?? ""}
                  onChange={(e) =>
                    setExpiresInDays(e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white"
                >
                  <option value="" className="bg-zinc-900">Never expires</option>
                  <option value="30" className="bg-zinc-900">30 days</option>
                  <option value="90" className="bg-zinc-900">90 days</option>
                  <option value="365" className="bg-zinc-900">1 year</option>
                </select>
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
                disabled={pending || !!plaintext}
                onClick={submit}
                className="xyra-gradient text-white border-0 hover:opacity-90"
              >
                {pending ? "Generating…" : "Generate key"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-white">Your new API key</h2>
            <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/5 p-2 text-[11px] text-red-200">
              <AlertTriangle className="mr-1 inline size-3" />
              Copy this now. We&apos;ll never show it again — losing it means
              generating a new key.
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/30 p-3">
              <code className="flex-1 break-all font-mono text-[12px] text-white">
                {plaintext}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(plaintext);
                  toast.success("Copied");
                }}
                className="border-white/10 bg-white/5 hover:bg-white/10"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
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
