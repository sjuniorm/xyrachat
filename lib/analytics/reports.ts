import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrgAnalytics = {
  conversations: { total: number; byChannel: Array<{ type: string; count: number }> };
  messages: { inbound: number; outbound: number };
  bot: { replies: number; handoffs: number; resolved: number; leads: number };
  ratings: { csatAvg: number | null; csatCount: number; nps: number | null; npsCount: number };
};

type Admin = ReturnType<typeof createAdminClient>;

async function headCount(q: { then: PromiseLike<{ count: number | null }>["then"] }): Promise<number> {
  const { count } = await (q as unknown as PromiseLike<{ count: number | null }>);
  return count ?? 0;
}

// Per-org analytics over [from, to]. Counts are bounded queries (head counts +
// a small channels list + the org's ratings); no full-table fetches.
export async function getOrgAnalytics(
  orgId: string,
  fromIso: string,
  toIso: string,
): Promise<OrgAnalytics> {
  const admin: Admin = createAdminClient();

  const { data: channels } = await admin
    .from("channels")
    .select("id, type")
    .eq("org_id", orgId)
    .is("deleted_at", null);

  const byChannel = await Promise.all(
    (channels ?? []).map(async (ch) => ({
      type: ch.type as string,
      count: await headCount(
        admin
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", ch.id)
          .is("deleted_at", null)
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
      ),
    })),
  );
  // Merge channels of the same type (e.g. two WhatsApp numbers).
  const channelMap: Record<string, number> = {};
  for (const c of byChannel) channelMap[c.type] = (channelMap[c.type] ?? 0) + c.count;
  const conversationsTotal = Object.values(channelMap).reduce((s, n) => s + n, 0);

  // Messages join to conversations for org scoping (messages have no org_id).
  const msgBase = () =>
    admin
      .from("messages")
      .select("id, conversations!inner(org_id)", { count: "exact", head: true })
      .eq("conversations.org_id", orgId)
      .is("deleted_at", null)
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
  const [inbound, outbound, botReplies] = await Promise.all([
    headCount(msgBase().eq("direction", "inbound")),
    headCount(msgBase().eq("direction", "outbound")),
    headCount(msgBase().eq("sender_type", "bot")),
  ]);

  // bot_outcomes scope by org via the bots join.
  const outcomeBase = (type: string) =>
    admin
      .from("bot_outcomes")
      .select("id, bots!inner(org_id, deleted_at)", { count: "exact", head: true })
      .eq("bots.org_id", orgId)
      .is("bots.deleted_at", null)
      .eq("type", type)
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
  const [handoffs, resolved, leads] = await Promise.all([
    headCount(outcomeBase("handoff")),
    headCount(outcomeBase("resolved")),
    headCount(outcomeBase("lead_captured")),
  ]);

  // Ratings (org_id is on the row → simple).
  const { data: ratings } = await admin
    .from("conversation_ratings")
    .select("kind, score")
    .eq("org_id", orgId)
    .not("score", "is", null)
    .is("deleted_at", null)
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  const csat = (ratings ?? []).filter((r) => r.kind === "csat" && typeof r.score === "number");
  const nps = (ratings ?? []).filter((r) => r.kind === "nps" && typeof r.score === "number");
  const csatAvg = csat.length
    ? Math.round((csat.reduce((s, r) => s + (r.score as number), 0) / csat.length) * 100) / 100
    : null;
  let npsScore: number | null = null;
  if (nps.length) {
    const p = nps.filter((r) => (r.score as number) >= 9).length;
    const d = nps.filter((r) => (r.score as number) <= 6).length;
    npsScore = Math.round(((p - d) / nps.length) * 100);
  }

  return {
    conversations: {
      total: conversationsTotal,
      byChannel: Object.entries(channelMap)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    },
    messages: { inbound, outbound },
    bot: { replies: botReplies, handoffs, resolved, leads },
    ratings: { csatAvg, csatCount: csat.length, nps: npsScore, npsCount: nps.length },
  };
}
