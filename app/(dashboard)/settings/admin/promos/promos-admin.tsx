"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Power, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  createPromoCode,
  disablePromoCode,
  seedLaunchPromos,
} from "@/lib/billing/promo-actions";
import type { CreatePromoInput } from "@/lib/billing/promo";

type Code = {
  id: string;
  code: string;
  kind: string;
  description: string | null;
  percent_off: number | null;
  amount_off_cents: number | null;
  trial_days: number | null;
  max_redemptions: number | null;
  redemption_count: number;
  expires_at: string | null;
  active: boolean;
};

const KINDS: Array<{ value: CreatePromoInput["kind"]; label: string }> = [
  { value: "discount", label: "Percent discount" },
  { value: "free_month", label: "Free month (100% off)" },
  { value: "free_trial", label: "Free trial (N days)" },
  { value: "trial_extension", label: "Extend trial (N days)" },
];

export function PromosAdmin({ codes }: { codes: Code[] }) {
  const [busy, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          disabled={busy}
          variant="outline"
          onClick={() =>
            startTransition(async () => {
              const res = await seedLaunchPromos();
              if (!res.ok) toast.error(res.error);
              else toast.success(`Seeded ${res.data?.created ?? 0} launch codes (LAUNCH50 / FREEMONTH / BETA90)`);
            })
          }
          className="border-white/10 bg-white/5 hover:bg-white/10"
        >
          <Zap className="mr-1.5 size-4" />
          Seed launch codes
        </Button>
        <Button
          onClick={() => setCreating((v) => !v)}
          className="xyra-gradient text-white border-0 hover:opacity-90"
        >
          <Plus className="mr-1.5 size-4" />
          New code
        </Button>
      </div>

      {creating && <CreateForm busy={busy} startTransition={startTransition} onDone={() => setCreating(false)} />}

      {codes.length === 0 ? (
        <Card className="border-white/10 bg-card/60">
          <CardContent className="py-6 text-sm text-white/50">No promo codes yet.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {codes.map((c) => (
            <li key={c.id}>
              <Card className="border-white/10 bg-card/60">
                <CardContent className="flex flex-wrap items-center gap-3 py-3 text-xs">
                  <code className="font-mono text-sm font-semibold text-white">{c.code}</code>
                  <Badge variant="outline" className="h-5 border-white/15 bg-white/5 px-1.5 text-[10px] text-white/70">
                    {c.kind}
                  </Badge>
                  <span className="text-white/60">
                    {c.percent_off ? `${c.percent_off}% off` : ""}
                    {c.amount_off_cents ? `€${(c.amount_off_cents / 100).toFixed(2)} off` : ""}
                    {c.trial_days ? `${c.trial_days} trial days` : ""}
                  </span>
                  <span className="text-white/50">
                    {c.redemption_count}
                    {c.max_redemptions ? `/${c.max_redemptions}` : ""} used
                  </span>
                  {c.expires_at && (
                    <span className="text-white/40" suppressHydrationWarning>
                      exp {new Date(c.expires_at).toLocaleDateString()}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        c.active
                          ? "h-5 border-emerald-400/30 bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300"
                          : "h-5 border-zinc-500/30 bg-zinc-500/20 px-1.5 text-[10px] text-zinc-300"
                      }
                    >
                      {c.active ? "Active" : "Disabled"}
                    </Badge>
                    {c.active && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await disablePromoCode(c.id);
                            if (!res.ok) toast.error(res.error);
                            else toast.success("Disabled");
                          })
                        }
                        className="h-7 border-white/10 bg-white/5 text-[10px] hover:bg-white/10"
                      >
                        <Power className="mr-1 size-3" />
                        Disable
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateForm({
  busy,
  startTransition,
  onDone,
}: {
  busy: boolean;
  startTransition: (cb: () => Promise<void>) => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<CreatePromoInput["kind"]>("discount");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");

  function submit() {
    const input: CreatePromoInput = {
      code,
      kind,
      description: description || undefined,
      maxRedemptions: maxRedemptions ? parseInt(maxRedemptions, 10) : undefined,
    };
    const n = parseInt(value, 10);
    if (kind === "discount") input.percentOff = n;
    if (kind === "free_trial" || kind === "trial_extension") input.trialDays = n;
    // free_month needs no value
    startTransition(async () => {
      const res = await createPromoCode(input);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`Created ${res.data?.code}`);
        onDone();
      }
    });
  }

  const needsValue = kind === "discount" || kind === "free_trial" || kind === "trial_extension";

  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader>
        <CardTitle className="text-base">New promo code</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAUNCH50" className="mt-1 font-mono" />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CreatePromoInput["kind"])}
            className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value} className="bg-zinc-900">{k.label}</option>
            ))}
          </select>
        </div>
        {needsValue && (
          <div>
            <Label className="text-xs">{kind === "discount" ? "Percent off" : "Trial days"}</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="mt-1" />
          </div>
        )}
        <div>
          <Label className="text-xs">Max redemptions (blank = unlimited)</Label>
          <Input value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} type="number" className="mt-1" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Description (internal)</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
        </div>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onDone} className="border-white/10 bg-white/5 hover:bg-white/10">Cancel</Button>
          <Button disabled={busy || !code.trim()} onClick={submit} className="xyra-gradient text-white border-0 hover:opacity-90">
            Create
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
