"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Tag } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { recordCancellationFeedback } from "@/lib/billing/cancellation-actions";

type StartTransition = (cb: () => Promise<void>) => void;

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

        {/* Promo code redemption — owners only */}
        {isOwner && <RedeemRow busy={busy} startTransition={startTransition} />}

        {hasStripeCustomer && isOwner && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div>
              <p className="text-sm text-white">Manage subscription</p>
              <p className="text-[11px] text-white/50">
                Update payment method, view invoices, or cancel — via Stripe.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CancelButton busy={busy} startTransition={startTransition} onPortal={openPortal} />
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

// "Have a code?" — redeems via the rate-limited customer endpoint.
function RedeemRow({ busy, startTransition }: { busy: boolean; startTransition: StartTransition }) {
  const [code, setCode] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-white/10 bg-white/[0.02] p-3">
      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 flex items-center gap-1.5 text-xs text-white/70">
          <Tag className="size-3.5" />
          Have a code?
        </label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="LAUNCH50"
          className="font-mono"
        />
      </div>
      <Button
        variant="outline"
        disabled={busy || !code.trim()}
        onClick={() =>
          startTransition(async () => {
            try {
              const res = await fetch("/api/billing/promo/redeem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
              });
              const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
              if (!res.ok || !json?.ok) {
                toast.error(json?.error ?? "Couldn't redeem that code.");
                return;
              }
              toast.success(json.message ?? "Code applied.");
              setCode("");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Network error");
            }
          })
        }
        className="border-white/10 bg-white/5 hover:bg-white/10"
      >
        Redeem
      </Button>
    </div>
  );
}

const CANCEL_REASONS = [
  "Too expensive",
  "Missing a feature I need",
  "Found an alternative",
  "Not using it enough",
  "Bugs or technical issues",
  "Bought it for a project that's now done",
  "Other",
];

// Intercepts cancel — captures a reason BEFORE redirecting to Stripe Portal.
function CancelButton({
  busy,
  startTransition,
  onPortal,
}: {
  busy: boolean;
  startTransition: StartTransition;
  onPortal: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");

  function finish(proceeded: boolean) {
    startTransition(async () => {
      if (reason) {
        await recordCancellationFeedback({ reason, reasonDetail: detail || undefined, proceeded });
      }
      setOpen(false);
      if (proceeded) onPortal();
      else toast.success("Glad you're staying!");
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="text-white/50 hover:bg-white/5 hover:text-white"
      >
        Cancel
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white">Before you go</h2>
            <p className="mt-1 text-xs text-white/60">
              Help us improve — what&apos;s the main reason? (Then you&apos;ll continue to Stripe to finish cancelling.)
            </p>
            <div className="mt-3 space-y-1.5">
              {CANCEL_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`block w-full rounded-md border px-3 py-2 text-left text-xs ${
                    reason === r
                      ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/10 text-white"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason && (
              <Input
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Anything else? (optional)"
                className="mt-2 text-xs"
              />
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => finish(false)}
                className="border-white/10 bg-white/5 hover:bg-white/10"
              >
                Keep my subscription
              </Button>
              <Button
                disabled={busy || !reason}
                onClick={() => finish(true)}
                className="bg-red-500/80 text-white border-0 hover:bg-red-500"
              >
                Continue to Stripe →
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
