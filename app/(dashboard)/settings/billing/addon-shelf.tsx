"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addonsForBundle, type Addon, type AddonId } from "@/lib/billing/addons";
import type { BundleId } from "@/lib/billing/bundles";
import { purchaseAddon, removeAddon } from "@/lib/billing/addon-actions";

// Add-on shelf — shown on /settings/billing for packs that allow add-ons
// (Edge/Prime). Owners buy/adjust/remove; everyone else sees it read-only.
export function AddonShelf({
  bundleId,
  owned,
  isOwner,
}: {
  bundleId: BundleId;
  owned: Record<string, number>; // addonId -> quantity (active)
  isOwner: boolean;
}) {
  const addons = addonsForBundle(bundleId).filter((a) => a.available);
  if (addons.length === 0) return null;

  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader>
        <CardTitle className="text-base">Add-ons</CardTitle>
        <CardDescription>
          Extend your plan without upgrading. Billed monthly, prorated.
          {!isOwner && " Only the workspace owner can change add-ons."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {addons.map((a) => (
          <AddonRow key={a.id} addon={a} quantity={owned[a.id] ?? 0} isOwner={isOwner} />
        ))}
      </CardContent>
    </Card>
  );
}

function AddonRow({ addon, quantity, isOwner }: { addon: Addon; quantity: number; isOwner: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [qty, setQty] = useState(Math.max(1, quantity || 1));
  const isQuantity = addon.kind === "quantity";
  const active = quantity > 0;

  function buy(n: number) {
    if (!isOwner) return;
    start(async () => {
      const res = await purchaseAddon(addon.id as AddonId, n);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${addon.name} updated.`);
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await removeAddon(addon.id as AddonId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${addon.name} removed.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{addon.name}</p>
          {active && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300 ring-1 ring-emerald-400/20">
              <Check className="size-2.5" /> active{isQuantity ? ` ×${quantity}` : ""}
            </span>
          )}
        </div>
        <p className="text-xs text-white/55">{addon.description}</p>
        <p className="mt-0.5 text-[11px] text-white/45">
          {addon.monthlyPriceEur != null ? `€${addon.monthlyPriceEur}/mo${isQuantity ? " each" : ""}` : "Coming soon"}
        </p>
      </div>

      {isOwner && (
        <div className="flex items-center gap-2">
          {isQuantity && (
            <div className="flex items-center rounded-md border border-white/10 bg-white/5">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={busy}
                className="px-2 py-1 text-white/60 hover:text-white disabled:opacity-40"
                aria-label="Decrease"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-6 text-center text-sm tabular-nums">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                disabled={busy}
                className="px-2 py-1 text-white/60 hover:text-white disabled:opacity-40"
                aria-label="Increase"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          )}
          <Button
            size="sm"
            disabled={busy}
            onClick={() => buy(isQuantity ? qty : 1)}
            className="xyra-gradient text-white"
          >
            {active ? (isQuantity ? "Update" : "Active") : "Add"}
          </Button>
          {active && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={remove}
              className="border-white/10 bg-white/5 hover:bg-white/10"
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
