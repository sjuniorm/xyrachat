import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { PLANS, type PlanId } from "@/lib/billing/plans";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  // RLS lets agents read their org's subscription row.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, monthly_ai_tokens_limit, tokens_used_this_month, billing_cycle_start")
    .eq("org_id", profile.org_id)
    .maybeSingle();

  const currentPlanId: PlanId = (sub?.plan ?? "free") as PlanId;
  const currentPlan = PLANS[currentPlanId] ?? PLANS.free;
  const used = Number(sub?.tokens_used_this_month ?? 0);
  const limit = Number(sub?.monthly_ai_tokens_limit ?? currentPlan.monthlyAiTokensLimit);
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  // Next reset = billing_cycle_start + 30 days (matches the SQL function's
  // rollover semantics).
  const cycleStart = sub?.billing_cycle_start ? new Date(sub.billing_cycle_start) : null;
  const nextReset = cycleStart
    ? new Date(cycleStart.getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  const isOwnerOrAdmin = profile.role === "owner" || profile.role === "admin";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Plan & Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI usage is metered monthly. When you hit the cap, bot replies +
            AI Assist pause until the next cycle (or you upgrade).
          </p>
        </header>

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Current plan</CardTitle>
                <CardDescription>{currentPlan.description}</CardDescription>
              </div>
              <Badge
                variant="outline"
                className="h-6 border-[color:var(--xyra-glow)]/40 bg-[color:var(--xyra-glow)]/15 px-2 text-xs text-[color:var(--xyra-glow)]"
              >
                {currentPlan.name}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-end justify-between text-xs text-white/60">
                <span>
                  {used.toLocaleString()} / {limit.toLocaleString()} tokens
                </span>
                <span>{percent.toFixed(1)}% used</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full xyra-gradient transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {nextReset && (
                <p className="text-[11px] text-white/50">
                  Resets {nextReset.toLocaleDateString()} ({Math.max(0, Math.ceil((nextReset.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))} days from now)
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Plans</CardTitle>
            <CardDescription>
              Upgrade or downgrade any time. Limits apply per workspace.
              Pricing finalises at launch.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {(["free", "starter", "pro", "scale"] as PlanId[]).map((id) => {
              const p = PLANS[id];
              const isCurrent = id === currentPlanId;
              return (
                <div
                  key={id}
                  className={`rounded-lg border p-4 ${
                    isCurrent
                      ? "border-[color:var(--xyra-glow)]/50 bg-[color:var(--xyra-glow)]/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{p.name}</p>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[color:var(--xyra-glow)]">
                        <Check className="size-3" />
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {p.monthlyPriceEur === null
                      ? "Custom"
                      : `€${p.monthlyPriceEur}/mo`}
                  </p>
                  <p className="mt-1 text-xs text-white/60">{p.description}</p>
                  <p className="mt-2 text-[11px] text-white/50">
                    {p.monthlyAiTokensLimit.toLocaleString()} AI tokens/month
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-amber-400/30 bg-amber-400/5">
          <CardHeader>
            <CardTitle className="text-base">Self-serve upgrade — coming soon</CardTitle>
            <CardDescription>
              Stripe checkout wires up during launch prep (Week 14-15).
              {isOwnerOrAdmin
                ? " Until then, ping us to bump your plan — we'll update your subscription row manually."
                : " Ask your workspace owner to reach out for plan changes."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="border-white/10">
              <a href="mailto:team@xyrachat.com?subject=Plan upgrade request">
                Email us
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
