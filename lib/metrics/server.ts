import "server-only";
import { createClient } from "@/lib/supabase/server";

// Owner/agent metrics for the dashboard home. Everything is read through the
// USER-scoped client so Supabase RLS scopes it to the caller's org automatically
// (no admin client, no org_id threading). Counts use head:true so no rows
// transfer; the 14-day trend fetches only conversation timestamps (far fewer
// rows than messages). A daily-rollup RPC is the scale follow-up if an org's
// 14-day conversation volume ever gets large.

export type DailyPoint = { day: string; count: number };

export type OrgMetrics = {
  conversations: {
    total: number;
    open: number;
    closed: number;
    bot: number;
    snoozed: number;
    new7d: number;
    prev7d: number;
  };
  messages: { last7d: number; inbound7d: number; outbound7d: number };
  contacts: { total: number; new7d: number };
  channels: { total: number; byType: Array<{ type: string; count: number }> };
  bots: { total: number };
  botOutcomes: { handoffs: number; leadsCaptured: number; knowledgeGaps: number };
  team: { members: number };
  ai: { plan: string; tokensUsed: number; tokensLimit: number } | null;
  activity: DailyPoint[]; // new conversations per day, last 14 days
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function getOrgMetrics(): Promise<OrgMetrics> {
  const supabase = await createClient();
  const c = () => supabase; // brevity
  const sevenAgo = isoDaysAgo(7);
  const fourteenAgo = isoDaysAgo(14);

  const headCount = (table: string) =>
    c().from(table).select("id", { count: "exact", head: true });

  const [
    convTotal,
    convOpen,
    convClosed,
    convBot,
    convSnoozed,
    convNew7,
    convPrev7,
    msg7,
    msgIn7,
    msgOut7,
    contactsTotal,
    contactsNew7,
    channelRows,
    botsTotal,
    ocHandoff,
    ocLeads,
    ocGaps,
    membersTotal,
    subRes,
    activityRes,
  ] = await Promise.all([
    headCount("conversations"),
    headCount("conversations").eq("status", "open"),
    headCount("conversations").eq("status", "closed"),
    headCount("conversations").eq("status", "bot"),
    headCount("conversations").eq("status", "snoozed"),
    headCount("conversations").gte("created_at", sevenAgo),
    headCount("conversations").gte("created_at", fourteenAgo).lt("created_at", sevenAgo),
    headCount("messages").gte("created_at", sevenAgo),
    headCount("messages").gte("created_at", sevenAgo).eq("direction", "inbound"),
    headCount("messages").gte("created_at", sevenAgo).eq("direction", "outbound"),
    headCount("contacts"),
    headCount("contacts").gte("created_at", sevenAgo),
    c().from("channels").select("type").eq("active", true),
    headCount("bots").is("deleted_at", null),
    headCount("bot_outcomes").eq("type", "handoff"),
    headCount("bot_outcomes").eq("type", "lead_captured"),
    headCount("bot_outcomes").eq("type", "fallback_no_knowledge"),
    headCount("profiles"), // RLS: visible profiles = active org members
    c()
      .from("subscriptions")
      .select("plan, tokens_used_this_month, monthly_ai_tokens_limit")
      .maybeSingle(),
    c().from("conversations").select("created_at").gte("created_at", fourteenAgo),
  ]);

  // Channel breakdown.
  const byTypeMap: Record<string, number> = {};
  for (const row of (channelRows.data as Array<{ type: string }> | null) ?? []) {
    byTypeMap[row.type] = (byTypeMap[row.type] ?? 0) + 1;
  }
  const byType = Object.entries(byTypeMap)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // 14-day new-conversation trend (UTC day buckets, oldest → newest).
  const buckets: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    buckets[new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)] = 0;
  }
  for (const row of (activityRes.data as Array<{ created_at: string }> | null) ?? []) {
    const key = row.created_at.slice(0, 10);
    if (key in buckets) buckets[key] += 1;
  }
  const activity = Object.entries(buckets).map(([day, count]) => ({ day, count }));

  const sub = subRes.data as
    | { plan: string; tokens_used_this_month: number; monthly_ai_tokens_limit: number }
    | null;

  return {
    conversations: {
      total: convTotal.count ?? 0,
      open: convOpen.count ?? 0,
      closed: convClosed.count ?? 0,
      bot: convBot.count ?? 0,
      snoozed: convSnoozed.count ?? 0,
      new7d: convNew7.count ?? 0,
      prev7d: convPrev7.count ?? 0,
    },
    messages: {
      last7d: msg7.count ?? 0,
      inbound7d: msgIn7.count ?? 0,
      outbound7d: msgOut7.count ?? 0,
    },
    contacts: { total: contactsTotal.count ?? 0, new7d: contactsNew7.count ?? 0 },
    channels: { total: (channelRows.data ?? []).length, byType },
    bots: { total: botsTotal.count ?? 0 },
    botOutcomes: {
      handoffs: ocHandoff.count ?? 0,
      leadsCaptured: ocLeads.count ?? 0,
      knowledgeGaps: ocGaps.count ?? 0,
    },
    team: { members: membersTotal.count ?? 0 },
    ai: sub
      ? {
          plan: sub.plan,
          tokensUsed: sub.tokens_used_this_month ?? 0,
          tokensLimit: sub.monthly_ai_tokens_limit ?? 0,
        }
      : null,
    activity,
  };
}
