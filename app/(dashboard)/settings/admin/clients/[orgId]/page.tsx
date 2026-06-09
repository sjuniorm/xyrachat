import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOperatorProfile } from "@/lib/admin/operator";
import { getOrgAnalytics } from "@/lib/analytics/reports";
import { BUNDLES } from "@/lib/billing/bundles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientActions } from "./client-actions";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
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
  if (!isOperatorProfile(profile.role, profile.org_id)) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="text-sm text-white/60">Operators only.</p>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, created_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) notFound();

  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [{ data: sub }, { data: ents }, { data: owner }, stats, { data: errors }] =
    await Promise.all([
      admin
        .from("subscriptions")
        .select("plan, status, trial_ends_at, current_period_end, cancel_at_period_end, tokens_used_this_month, monthly_ai_tokens_limit")
        .eq("org_id", orgId)
        .maybeSingle(),
      admin.from("org_entitlements").select("feature_key, value, source, expires_at").eq("org_id", orgId),
      admin.from("profiles").select("full_name, email").eq("org_id", orgId).eq("role", "owner").is("deleted_at", null).maybeSingle(),
      getOrgAnalytics(orgId, from, now.toISOString()),
      admin
        .from("api_request_log")
        .select("method, path, status, created_at")
        .eq("org_id", orgId)
        .gte("status", 400)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const tiles = [
    { label: "Conversations (30d)", value: stats.conversations.total },
    { label: "Inbound msgs", value: stats.messages.inbound },
    { label: "Outbound msgs", value: stats.messages.outbound },
    { label: "Bot replies", value: stats.bot.replies },
    { label: "Handoffs", value: stats.bot.handoffs },
    { label: "Leads", value: stats.bot.leads },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/settings/admin/clients" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="size-3.5" /> Clients
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
            <p className="mt-1 text-sm text-white/50">
              Owner: {owner?.full_name ?? "—"} · {owner?.email ?? "no email"} · joined{" "}
              {new Date(org.created_at as string).toLocaleDateString()}
            </p>
          </div>
          <Badge variant="outline" className="border-white/15 bg-white/5 text-xs capitalize text-white/70">
            {sub?.plan ?? "—"} · {sub?.status ?? "—"}
          </Badge>
        </header>

        {/* Stats (last 30 days) */}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {tiles.map((t) => (
            <Card key={t.label} className="border-white/10 bg-card/60">
              <CardContent className="p-3">
                <p className="text-[11px] text-white/50">{t.label}</p>
                <p className="mt-1 text-xl font-semibold text-white">{t.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {(stats.ratings.csatAvg !== null || stats.ratings.nps !== null) && (
          <p className="text-xs text-white/50">
            {stats.ratings.csatAvg !== null && <>CSAT {stats.ratings.csatAvg}/5 ({stats.ratings.csatCount}) · </>}
            {stats.ratings.nps !== null && <>NPS {stats.ratings.nps > 0 ? `+${stats.ratings.nps}` : stats.ratings.nps} ({stats.ratings.npsCount})</>}
          </p>
        )}

        {/* Subscription + actions */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Subscription &amp; actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-[11px] text-white/50">Plan</p><p className="capitalize">{sub?.plan ?? "—"}</p></div>
              <div><p className="text-[11px] text-white/50">Status</p><p>{sub?.status ?? "—"}</p></div>
              <div><p className="text-[11px] text-white/50">Trial ends</p><p>{sub?.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString() : "—"}</p></div>
              <div><p className="text-[11px] text-white/50">AI tokens</p><p>{(sub?.tokens_used_this_month ?? 0).toLocaleString()} / {(sub?.monthly_ai_tokens_limit ?? 0).toLocaleString()}</p></div>
            </div>
            <ClientActions orgId={orgId} bundles={Object.keys(BUNDLES)} currentPlan={sub?.plan ?? null} />
          </CardContent>
        </Card>

        {/* Entitlements */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Permissions ({ents?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {(ents ?? []).length === 0 ? (
              <p className="text-sm text-amber-300">Not provisioned — pick a plan above to grant features.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(ents ?? []).map((e, i) => (
                  <span key={i} className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                    {e.feature_key}: <span className="text-white/90">{e.value}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-white/40">
              Fine-grained grant/revoke →{" "}
              <Link href="/settings/admin/entitlements" className="underline">Entitlements console</Link>
              {" · "}Recover deleted data →{" "}
              <Link href="/settings/admin/restore" className="underline">Restore</Link>
            </p>
          </CardContent>
        </Card>

        {/* Recent errors */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Recent failed API calls</CardTitle>
          </CardHeader>
          <CardContent>
            {(errors ?? []).length === 0 ? (
              <p className="text-sm text-white/50">No failed API requests logged.</p>
            ) : (
              <ul className="space-y-1 text-xs font-mono">
                {(errors ?? []).map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-white/70">
                    <span className="text-rose-300">{e.status}</span>
                    <span>{e.method}</span>
                    <span className="truncate">{e.path}</span>
                    <span className="ml-auto text-white/40">{new Date(e.created_at as string).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
