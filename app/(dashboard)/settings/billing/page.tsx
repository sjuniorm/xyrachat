import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUNDLES, type BundleId } from "@/lib/billing/bundles";
import { getAllEntitlements, isProvisioned } from "@/lib/billing/entitlements";
import { UpgradePanel } from "./upgrade-panel";
import { AddonShelf } from "./addon-shelf";

// Live usage counts for the meters. Cheap COUNT(*) per resource.
async function usageCounts(orgId: string) {
  const admin = createAdminClient();
  const monthStart = (() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString();
  })();
  const [channels, bots, members, broadcasts] = await Promise.all([
    admin.from("channels").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    admin.from("bots").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    admin.from("broadcasts").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", monthStart).is("deleted_at", null),
  ]);
  return {
    channels: channels.count ?? 0,
    bots: bots.count ?? 0,
    members: members.count ?? 0,
    broadcasts: broadcasts.count ?? 0,
  };
}

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
  const orgId = profile.org_id;
  const isOwner = profile.role === "owner";

  // The subscription row only needs orgId (resolved above) — fold it into the
  // existing parallel batch instead of an extra sequential round-trip.
  const [{ data: sub }, provisioned, entMap, usage, { data: addonRows }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, monthly_ai_tokens_limit, tokens_used_this_month, billing_cycle_start, current_period_end, cancel_at_period_end, trial_ends_at")
      .eq("org_id", orgId)
      .maybeSingle(),
    isProvisioned(orgId),
    getAllEntitlements(orgId),
    usageCounts(orgId),
    supabase
      .from("org_addons")
      .select("addon_id, quantity")
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("deleted_at", null),
  ]);
  const ownedAddons: Record<string, number> = {};
  for (const r of (addonRows as Array<{ addon_id: string; quantity: number }> | null) ?? []) {
    ownedAddons[r.addon_id] = r.quantity;
  }

  // Resolve effective numeric limits from entitlements (fail-open →
  // unlimited shown as ∞ for un-provisioned orgs).
  function limitOf(key: string): number {
    if (!provisioned) return Infinity;
    const rows = entMap.get(key);
    if (!rows || rows.length === 0) return 0;
    const vals = rows.map((r) => r.value);
    if (vals.includes("-1")) return Infinity;
    return Math.max(...vals.map((v) => parseInt(v, 10)).filter(Number.isFinite));
  }

  const planLabel = (sub?.plan ?? "trial") as string;
  const bundle = BUNDLES[(planLabel as BundleId)] ?? null;

  const aiUsed = Number(sub?.tokens_used_this_month ?? 0);
  const aiLimit = Number(sub?.monthly_ai_tokens_limit ?? 50000);
  const aiPercent = aiLimit > 0 ? Math.min(100, (aiUsed / aiLimit) * 100) : 0;

  const meters = [
    { label: "Channels", used: usage.channels, max: limitOf("channels:max") },
    { label: "Team members", used: usage.members, max: limitOf("team_members:max") },
    { label: "Bots", used: usage.bots, max: limitOf("bots:max") },
    { label: "Broadcasts this month", used: usage.broadcasts, max: limitOf("broadcasts:monthly") },
  ];

  const trialEnds = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const trialDaysLeft = trialEnds
    ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Plan & Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your plan, what you&apos;re using, and how to upgrade.
          </p>
        </header>

        {/* Current plan + status */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Current plan</CardTitle>
                <CardDescription>
                  {bundle?.description ?? "Custom plan — managed by Xyra."}
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="h-6 border-[color:var(--xyra-glow)]/40 bg-[color:var(--xyra-glow)]/15 px-2 text-xs capitalize text-[color:var(--xyra-glow)]"
              >
                {bundle?.name ?? planLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {sub?.status && sub.status !== "active" && (
              <div className="rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
                Subscription status: <span className="font-medium capitalize">{sub.status}</span>
                {sub.cancel_at_period_end && sub.current_period_end
                  ? ` — ends ${new Date(sub.current_period_end).toLocaleDateString()}`
                  : ""}
              </div>
            )}
            {trialDaysLeft != null && (sub?.status === "trialing" || planLabel === "trial") && (
              <div className="rounded-md border border-sky-400/30 bg-sky-400/5 px-3 py-2 text-xs text-sky-200">
                Trial ends in {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"}.
              </div>
            )}

            {/* AI tokens meter */}
            <Meter
              label="AI tokens this cycle"
              used={aiUsed}
              maxDisplay={aiLimit.toLocaleString()}
              percent={aiPercent}
            />

            {/* Resource meters */}
            <div className="grid gap-3 sm:grid-cols-2">
              {meters.map((m) => (
                <Meter
                  key={m.label}
                  label={m.label}
                  used={m.used}
                  maxDisplay={m.max === Infinity ? "∞" : String(m.max)}
                  percent={m.max === Infinity || m.max === 0 ? 0 : Math.min(100, (m.used / m.max) * 100)}
                  compact
                />
              ))}
            </div>

            {!provisioned && (
              <p className="text-[11px] text-white/40">
                This workspace isn&apos;t on a billed plan yet — all limits show
                as unlimited (∞). Pick a plan below to activate billing.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Plan comparison + upgrade (client component handles checkout) */}
        <UpgradePanel
          currentPlan={planLabel}
          isOwner={isOwner}
          hasStripeCustomer={sub?.status !== undefined}
        />

        {/* Add-ons — only for packs that allow them (Edge/Prime) */}
        {bundle?.addonsAllowed && (
          <AddonShelf bundleId={bundle.id} owned={ownedAddons} isOwner={isOwner} />
        )}
      </div>
    </div>
  );
}

function Meter({
  label,
  used,
  maxDisplay,
  percent,
  compact,
}: {
  label: string;
  used: number;
  maxDisplay: string;
  percent: number;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between text-xs text-white/60">
        <span>{label}</span>
        <span className="tabular-nums">
          {used.toLocaleString()} / {maxDisplay}
        </span>
      </div>
      <div className={`overflow-hidden rounded-full bg-white/5 ${compact ? "h-1.5" : "h-2"}`}>
        <div
          className="h-full rounded-full xyra-gradient transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
