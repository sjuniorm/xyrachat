"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Plan comparison + checkout/portal launcher. Client component because
// it POSTs to /api/billing/checkout + /api/billing/portal and redirects
// to the returned Stripe URL.

type PlanCard = {
  id: "starter" | "pro" | "enterprise";
  name: string;
  monthly: number;
  blurb: string;
  highlights: string[];
};

const PLAN_CARDS: PlanCard[] = [
  {
    id: "starter",
    name: "Starter",
    monthly: 39,
    blurb: "Solo founders + small teams.",
    highlights: ["3 channels", "3 team members", "1 bot", "1,000 broadcasts/mo", "Read-only API"],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 99,
    blurb: "Growing teams that automate.",
    highlights: ["Unlimited channels", "10 team members", "3 bots", "Automations", "Full API + webhooks"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: 249,
    blurb: "High volume + white-label.",
    highlights: ["Unlimited everything", "White-label", "Priority support", "Custom integrations"],
  },
];

export function UpgradePanel({
  currentPlan,
  isOwner,
  hasStripeCustomer,
}: {
  currentPlan: string;
  isOwner: boolean;
  hasStripeCustomer: boolean;
}) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [busy, startTransition] = useTransition();

  function checkout(bundle: PlanCard["id"]) {
    if (!isOwner) {
      toast.error("Only the workspace owner can change the plan.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bundle, interval }),
        });
        const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
        if (!res.ok || !json?.url) {
          toast.error(json?.error ?? "Couldn't start checkout.");
          return;
        }
        window.location.href = json.url;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Network error");
      }
    });
  }

  function openPortal() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/portal", { method: "POST" });
        const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
        if (!res.ok || !json?.url) {
          toast.error(json?.error ?? "Couldn't open the billing portal.");
          return;
        }
        window.location.href = json.url;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Network error");
      }
    });
  }

  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Plans</CardTitle>
            <CardDescription>Upgrade or downgrade any time. 20% off annual.</CardDescription>
          </div>
          <div className="flex rounded-md border border-white/10 bg-white/5 p-0.5 text-xs">
            {(["monthly", "yearly"] as const).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInterval(i)}
                className={`rounded px-2.5 py-1 capitalize ${
                  interval === i ? "bg-white/15 text-white" : "text-white/60"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {PLAN_CARDS.map((p) => {
            const isCurrent = currentPlan === p.id;
            const price = interval === "yearly" ? Math.round(p.monthly * 12 * 0.8) : p.monthly;
            return (
              <div
                key={p.id}
                className={`flex flex-col rounded-lg border p-4 ${
                  isCurrent
                    ? "border-[color:var(--xyra-glow)]/50 bg-[color:var(--xyra-glow)]/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  {isCurrent && (
                    <Badge variant="outline" className="h-5 border-[color:var(--xyra-glow)]/40 bg-[color:var(--xyra-glow)]/15 px-1.5 text-[10px] text-[color:var(--xyra-glow)]">
                      Current
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  €{price}
                  <span className="text-xs font-normal text-white/50">/{interval === "yearly" ? "yr" : "mo"}</span>
                </p>
                <p className="mt-1 text-xs text-white/60">{p.blurb}</p>
                <ul className="mt-3 flex-1 space-y-1">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-1.5 text-[11px] text-white/70">
                      <Check className="mt-0.5 size-3 shrink-0 text-[color:var(--xyra-glow)]" />
                      {h}
                    </li>
                  ))}
                </ul>
                <Button
                  disabled={busy || isCurrent}
                  onClick={() => checkout(p.id)}
                  className="mt-3 xyra-gradient text-white border-0 hover:opacity-90 disabled:opacity-40"
                >
                  {isCurrent ? "Current plan" : `Choose ${p.name}`}
                </Button>
              </div>
            );
          })}
        </div>

        {hasStripeCustomer && isOwner && (
          <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div>
              <p className="text-sm text-white">Manage subscription</p>
              <p className="text-[11px] text-white/50">
                Update payment method, view invoices, or cancel — via Stripe.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={openPortal}
              className="border-white/10 bg-white/5 hover:bg-white/10"
            >
              Open portal
              <ExternalLink className="ml-1 size-3.5" />
            </Button>
          </div>
        )}
        {!isOwner && (
          <p className="text-[11px] text-white/40">
            Only the workspace owner can change the plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
