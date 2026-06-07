import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Inbox,
  MessageCircle,
  MessagesSquare,
  Plug,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getOrgMetrics, type DailyPoint } from "@/lib/metrics/server";
import { GetStartedWidget } from "@/components/app/get-started-widget";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
  email: "Email",
  messenger: "Messenger",
  webchat: "Web chat",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const m = await getOrgMetrics();
  const wow = pctChange(m.conversations.new7d, m.conversations.prev7d);

  const getStartedSteps = [
    { key: "account", label: "Create your account", href: "/settings", done: true },
    { key: "channel", label: "Connect a channel (WhatsApp or Instagram)", href: "/settings/channels", done: m.channels.total > 0 },
    { key: "team", label: "Invite a team member", href: "/settings/team", done: m.team.members > 1 },
    { key: "bot", label: "Create your AI bot", href: "/bots/new", done: m.bots.total > 0 },
    { key: "message", label: "Send your first message", href: "/inbox", done: m.messages.outbound7d > 0 },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to <span className="xyra-gradient-text">Xyra Chat</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          {m.channels.total === 0
            ? "Your unified inbox is ready. Connect a channel to start messaging your customers."
            : "Here's how your workspace is doing."}
        </p>
      </header>

      <GetStartedWidget steps={getStartedSteps} />

      {m.channels.total === 0 && (
        <Card className="mb-8 border-[color:var(--xyra-purple)]/30 bg-[color:var(--xyra-purple)]/10">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <Plug className="size-5 text-[color:var(--xyra-glow)]" />
              <p className="text-sm text-white/80">
                Connect your first channel to start receiving messages.
              </p>
            </div>
            <Button asChild className="xyra-gradient border-0 text-white hover:opacity-90">
              <Link href="/settings/channels">Connect a channel</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={Inbox} label="Open conversations" value={m.conversations.open} />
        <StatCard
          icon={MessagesSquare}
          label="Messages (7 days)"
          value={m.messages.last7d}
          sub={`${m.messages.inbound7d.toLocaleString()} in · ${m.messages.outbound7d.toLocaleString()} out`}
        />
        <StatCard icon={Users} label="Contacts" value={m.contacts.total} sub={`+${m.contacts.new7d} this week`} />
        <StatCard icon={MessageCircle} label="Active channels" value={m.channels.total} />
        <StatCard icon={Bot} label="Bots" value={m.bots.total} sub={`${m.conversations.bot} bot conversations`} />
        <StatCard icon={Users} label="Team members" value={m.team.members} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Activity trend */}
        <Card className="border-white/10 bg-card/60 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">New conversations</CardTitle>
              <span className="text-xs text-white/50">last 14 days</span>
            </div>
            <CardDescription className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-white">
                {m.conversations.new7d.toLocaleString()}
              </span>
              <span className="text-xs">this week</span>
              {wow !== null && <DeltaBadge value={wow} />}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Sparkline data={m.activity} />
          </CardContent>
        </Card>

        {/* Conversation status breakdown */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversations</CardTitle>
            <CardDescription>{m.conversations.total.toLocaleString()} total</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <BarRow label="Open" value={m.conversations.open} total={m.conversations.total} color="#34d399" />
            <BarRow label="Bot handling" value={m.conversations.bot} total={m.conversations.total} color="var(--xyra-purple)" />
            <BarRow label="Snoozed" value={m.conversations.snoozed} total={m.conversations.total} color="#fbbf24" />
            <BarRow label="Closed" value={m.conversations.closed} total={m.conversations.total} color="#71717a" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Channel breakdown */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Channels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {m.channels.byType.length === 0 ? (
              <p className="text-sm text-white/50">No channels connected yet.</p>
            ) : (
              m.channels.byType.map((ch) => (
                <div key={ch.type} className="flex items-center justify-between text-sm">
                  <span className="text-white/80">{CHANNEL_LABELS[ch.type] ?? ch.type}</span>
                  <span className="font-medium text-white">{ch.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Bot performance */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bot performance</CardTitle>
            <CardDescription>All-time outcomes</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Handoffs" value={m.botOutcomes.handoffs} />
            <MiniStat label="Leads" value={m.botOutcomes.leadsCaptured} />
            <MiniStat label="Knowledge gaps" value={m.botOutcomes.knowledgeGaps} />
          </CardContent>
        </Card>

        {/* AI usage */}
        <Card className="border-white/10 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI usage</CardTitle>
            <CardDescription>{m.ai ? `${m.ai.plan} plan · this month` : "No plan data"}</CardDescription>
          </CardHeader>
          <CardContent>
            {m.ai ? <UsageBar used={m.ai.tokensUsed} limit={m.ai.tokensLimit} /> : (
              <p className="text-sm text-white/50">Usage appears once billing is set up.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="mt-8 flex flex-wrap gap-2">
        <QuickLink href="/inbox" label="Open inbox" />
        <QuickLink href="/bots" label="Bots" />
        <QuickLink href="/broadcasts" label="Broadcasts" />
        <QuickLink href="/automations" label="Automations" />
        <QuickLink href="/settings/billing" label="Billing" />
      </div>
    </div>
  );
}

function pctChange(current: number, prev: number): number | null {
  if (prev <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - prev) / prev) * 100);
}

function DeltaBadge({ value }: { value: number }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        up ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"
      }`}
    >
      <Icon className="size-3" />
      {Math.abs(value)}%
    </span>
  );
}

function Sparkline({ data }: { data: DailyPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-24 items-end gap-1">
      {data.map((d) => (
        <div
          key={d.day}
          title={`${d.day}: ${d.count}`}
          className="flex-1 rounded-t bg-[color:var(--xyra-purple)] transition-all hover:bg-[color:var(--xyra-glow)]"
          style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function BarRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-white/70">{label}</span>
        <span className="text-white/50">{value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-white">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-white/50">{label}</p>
    </div>
  );
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const unlimited = limit <= 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-white/80">{used.toLocaleString()} tokens</span>
        <span className="text-white/50">{unlimited ? "unlimited" : `of ${limit.toLocaleString()}`}</span>
      </div>
      {!unlimited && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full rounded-full ${pct >= 90 ? "bg-rose-400" : "xyra-gradient"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{value.toLocaleString()}</p>
        {sub && <p className="mt-1 text-xs text-white/50">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="border-white/10 bg-white/5 hover:bg-white/10">
      <Link href={href}>
        {label}
        <ArrowRight className="ml-1 size-3.5" />
      </Link>
    </Button>
  );
}
