import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgAnalytics } from "@/lib/analytics/reports";
import { ChannelIcon } from "@/components/ui/channel-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Channel } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { range } = await searchParams;
  const active = RANGES.find((r) => r.key === range) ?? RANGES[1];
  const now = new Date();
  const fromIso = new Date(now.getTime() - active.days * 86_400_000).toISOString();
  const stats = await getOrgAnalytics(profile.org_id, fromIso, now.toISOString());

  const tiles = [
    { label: "Conversations", value: stats.conversations.total },
    { label: "Inbound messages", value: stats.messages.inbound },
    { label: "Outbound messages", value: stats.messages.outbound },
    { label: "Bot replies", value: stats.bot.replies },
    { label: "Handoffs to human", value: stats.bot.handoffs },
    { label: "Leads captured", value: stats.bot.leads },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your workspace performance over the last {active.label}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 p-0.5">
              {RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={`/analytics?range=${r.key}`}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition",
                    r.key === active.key
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  {r.label}
                </Link>
              ))}
            </div>
            <Button asChild variant="outline" size="sm" className="border-white/10">
              <a href={`/api/analytics/export?range=${active.key}`}>
                <Download className="mr-1.5 size-3.5" /> Export CSV
              </a>
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <Card key={t.label} className="border-white/10 bg-card/60">
              <CardContent className="p-4">
                <p className="text-[11px] text-white/50">{t.label}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{t.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">Conversations by channel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.conversations.byChannel.length === 0 ? (
                <p className="text-sm text-white/40">No conversations in this range.</p>
              ) : (
                stats.conversations.byChannel.map((c) => (
                  <div key={c.type} className="flex items-center gap-2.5 text-sm">
                    <ChannelIcon channel={c.type as Channel} size="sm" withRing={false} />
                    <span className="capitalize text-white/70">{c.type}</span>
                    <span className="ml-auto font-medium text-white">{c.count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">Satisfaction</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-8">
              <div>
                <p className="text-xs text-white/50">CSAT (avg / 5)</p>
                <p className="text-2xl font-semibold text-white">
                  {stats.ratings.csatAvg ?? "—"}
                </p>
                <p className="text-[11px] text-white/40">{stats.ratings.csatCount} responses</p>
              </div>
              <div>
                <p className="text-xs text-white/50">NPS</p>
                <p className="text-2xl font-semibold text-white">
                  {stats.ratings.nps === null
                    ? "—"
                    : stats.ratings.nps > 0
                      ? `+${stats.ratings.nps}`
                      : stats.ratings.nps}
                </p>
                <p className="text-[11px] text-white/40">{stats.ratings.npsCount} responses</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Bot resolved</p>
                <p className="text-2xl font-semibold text-white">{stats.bot.resolved}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="text-[11px] text-white/40">
          Surveys are configured in <Link href="/settings/inbox" className="underline">Settings → Inbox</Link>.
        </p>
      </div>
    </div>
  );
}
