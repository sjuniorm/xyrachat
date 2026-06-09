"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { provisionOrgBundle, extendOrgTrial } from "@/lib/billing/admin-actions";

export function ClientActions({
  orgId,
  bundles,
  currentPlan,
}: {
  orgId: string;
  bundles: string[];
  currentPlan: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bundle, setBundle] = useState(currentPlan && bundles.includes(currentPlan) ? currentPlan : bundles[0] ?? "");
  const [days, setDays] = useState(14);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "Failed");
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 border-t border-white/5 pt-4">
      {/* Provision plan */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/50">Set plan:</span>
        <select
          value={bundle}
          onChange={(e) => setBundle(e.target.value)}
          className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
        >
          {bundles.map((b) => (
            <option key={b} value={b} className="bg-zinc-900 capitalize">{b}</option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !bundle}
          onClick={() => run(() => provisionOrgBundle(orgId, bundle as never), `Provisioned ${bundle}.`)}
          className="h-8 border-white/10 text-xs"
        >
          Provision
        </Button>
      </div>

      {/* Trial */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/50">Extend trial:</span>
        <Input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-8 w-16 px-2 text-xs"
        />
        <span className="text-xs text-white/50">days</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || days <= 0}
          onClick={() => run(() => extendOrgTrial(orgId, days), `Trial extended ${days} days.`)}
          className="h-8 border-white/10 text-xs"
        >
          Extend
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(() => extendOrgTrial(orgId, 30), "Gave a free month.")}
          className="xyra-gradient h-8 border-0 text-xs text-white"
        >
          🎁 Give a free month
        </Button>
      </div>
    </div>
  );
}
