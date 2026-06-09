import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Operator-only business-metrics dashboard, sourced entirely from our own
// Supabase data (no external API — Stripe/PostHog metrics need their APIs and
// land later). Access = owner of XYRA_OPERATOR_ORG_ID, or any owner pre-launch.
export const dynamic = "force-dynamic";

type SubRow = { plan: string | null; status: string | null; tokens_used_this_month: number | null };
type ChannelRow = { type: string | null };

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default async function MetricsAdminPage() {
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

  const operatorOrg = process.env.XYRA_OPERATOR_ORG_ID;
  const isOperator =
    profile.role === "owner" && (!operatorOrg || profile.org_id === operatorOrg);
  if (!isOperator) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="text-sm text-white/60">This page is for Xyra Chat operators only.</p>
      </div>
    );
  }

  const admin = createAdminClient();
  const d7 = isoDaysAgo(7);
  const d30 = isoDaysAgo(30);

  const [
    orgsTotal,
    orgs7d,
    orgs30d,
    conversationsTotal,
    conversations7d,
    messagesTotal,
    messages7d,
    botsTotal,
    contactsTotal,
    automationsTotal,
    { data: subs },
    { data: channels },
  ] = await Promise.all([
    admin.from("organizations").select("id", { count: "exact", head: true }).is("deleted_at", null).then((r) => r.count ?? 0),
    admin.from("organizations").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", d7).then((r) => r.count ?? 0),
    admin.from("organizations").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", d30).then((r) => r.count ?? 0),
    admin.from("conversations").select("id", { count: "exact", head: true }).is("deleted_at", null).then((r) => r.count ?? 0),
    admin.from("conversations").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", d7).then((r) => r.count ?? 0),
    admin.from("messages").select("id", { count: "exact", head: true }).is("deleted_at", null).then((r) => r.count ?? 0),
    admin.from("messages").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", d7).then((r) => r.count ?? 0),
    admin.from("bots").select("id", { count: "exact", head: true }).is("deleted_at", null).then((r) => r.count ?? 0),
    admin.from("contacts").select("id", { count: "exact", head: true }).is("deleted_at", null).then((r) => r.count ?? 0),
    admin.from("automations").select("id", { count: "exact", head: true }).is("deleted_at", null).then((r) => r.count ?? 0),
    admin.from("subscriptions").select("plan, status, tokens_used_this_month"),
    admin.from("channels").select("type").is("deleted_at", null),
  ]);

  const subRows = (subs as SubRow[] | null) ?? [];
  const byStatus: Record<string, number> = {};
  const byPlan: Record<string, number> = {};
  let aiTokens = 0;
  for (const s of subRows) {
    if (s.status) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    if (s.plan) byPlan[s.plan] = (byPlan[s.plan] ?? 0) + 1;
    aiTokens += s.tokens_used_this_month ?? 0;
  }

  const chanRows = (channels as ChannelRow[] | null) ?? [];
  const byType: Record<string, number> = {};
  for (const c of chanRows) {
    if (c.type) byType[c.type] = (byType[c.type] ?? 0) + 1;
  }
  const CHANNEL_LABEL: Record<string, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    telegram: "Telegram",
    email: "Email",
    facebook: "Messenger",
  };

  const tiles: Array<{ label: string; value: string; sub?: string }> = [
    { label: "Organizations", value: String(orgsTotal), sub: `+${orgs7d} this week · +${orgs30d} this month` },
    { label: "Channels", value: String(chanRows.length) },
    { label: "Conversations", value: String(conversationsTotal), sub: `+${conversations7d} this week` },
    { label: "Messages", value: String(messagesTotal), sub: `+${messages7d} this week` },
    { label: "Contacts", value: String(contactsTotal) },
    { label: "Bots", value: String(botsTotal) },
    { label: "Automations", value: String(automationsTotal) },
    { label: "AI tokens (this month)", value: aiTokens.toLocaleString() },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Business metrics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live counts from Xyra&apos;s own database. Stripe revenue + PostHog
            cohorts are surfaced separately once those APIs are wired.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label} className="border-white/10 bg-card/60">
              <CardContent className="p-4">
                <p className="text-xs text-white/50">{t.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{t.value}</p>
                {t.sub && <p className="mt-1 text-[11px] text-white/40">{t.sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Breakdown title="Subscriptions by status" data={byStatus} />
          <Breakdown title="Subscriptions by plan" data={byPlan} />
          <Breakdown
            title="Channels by type"
            data={Object.fromEntries(
              Object.entries(byType).map(([k, v]) => [CHANNEL_LABEL[k] ?? k, v]),
            )}
          />
        </div>
      </div>
    </div>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-xs text-white/40">No data yet.</p>
        ) : (
          entries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="capitalize text-white/70">{k}</span>
              <span className="font-medium text-white">{v}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
