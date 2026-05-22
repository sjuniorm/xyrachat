import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Outcome = { type: string; created_at: string };

export function OverviewTab({
  bot,
  sourceCount,
  activeChannelCount,
  outcomes,
}: {
  bot: { objective: string };
  sourceCount: number;
  activeChannelCount: number;
  outcomes: Outcome[];
}) {
  // Aggregate the last-500 outcomes into the tiles we show.
  const byType = outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.type] = (acc[o.type] ?? 0) + 1;
    return acc;
  }, {});
  const handoffs = byType.handoff ?? 0;
  const fallbacks = byType.fallback_no_knowledge ?? 0;
  const resolved = byType.resolved ?? 0;
  const total = handoffs + fallbacks + resolved;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Sources" value={sourceCount} />
      <Stat label="Active channels" value={activeChannelCount} />
      <Stat label="Handoffs (last 500)" value={handoffs} />
      <Stat
        label="Resolved without handoff"
        value={total > 0 ? `${Math.round((resolved / total) * 100)}%` : "—"}
      />
      <ObjectiveKpi objective={bot.objective} byType={byType} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-white/10 bg-card/60">
      <CardContent className="space-y-1 py-5">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-white/60">{label}</p>
      </CardContent>
    </Card>
  );
}

// Objective-specific KPI tile. Pulled from the same outcome rows so the
// Week 8 UI works even before we wire per-objective outcome capture in
// the bot gate (that lands as a follow-up).
function ObjectiveKpi({
  objective,
  byType,
}: {
  objective: string;
  byType: Record<string, number>;
}) {
  const map: Record<string, { title: string; description: string; value: number }> = {
    lead_generation: {
      title: "Leads captured",
      description: "Times a configured contact field was filled.",
      value: byType.lead_captured ?? 0,
    },
    website_traffic: {
      title: "Link clicks (estimated)",
      description: "Target URLs shared in conversation.",
      value: byType.link_clicked ?? 0,
    },
    sales: {
      title: "Checkout clicks",
      description: "Times the checkout link was shared.",
      value: byType.link_clicked ?? 0,
    },
    booking: {
      title: "Booking clicks",
      description: "Times the booking URL was shared.",
      value: byType.booking_clicked ?? 0,
    },
    qualification: {
      title: "Qualified leads",
      description: "Score met the handoff threshold.",
      value: byType.qualified ?? 0,
    },
    support: {
      title: "Knowledge gaps",
      description: "Inbound questions below similarity threshold.",
      value: byType.fallback_no_knowledge ?? 0,
    },
    custom: {
      title: "Total events",
      description: "Any tracked outcome.",
      value: Object.values(byType).reduce((s, n) => s + n, 0),
    },
  };
  const entry = map[objective] ?? map.custom;
  return (
    <Card className="border-white/10 bg-card/60 sm:col-span-2 lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{entry.title}</CardTitle>
        <CardDescription>{entry.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{entry.value}</p>
      </CardContent>
    </Card>
  );
}
