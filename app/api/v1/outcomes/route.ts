import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeCursor, encodeCursor, parseLimit } from "@/lib/api/pagination";
import { invalidRequest } from "@/lib/api/errors";
import { shapeOutcome } from "@/lib/api/shapes";

export const runtime = "nodejs";

// GET /api/v1/outcomes — bot outcomes (analytics events) for the org.
// Filters: ?bot_id=&type=&from=&to=
export const GET = apiHandler({
  scopes: ["outcomes:read"],
  handler: async (req, ctx) => {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorRaw = url.searchParams.get("cursor");
    const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
    if (cursorRaw && !cursor) return invalidRequest("invalid_cursor", "Cursor is malformed.");
    const botId = url.searchParams.get("bot_id");
    const type = url.searchParams.get("type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const admin = createAdminClient();
    // bot_outcomes is gated through bots; join on bot.org_id to enforce
    // tenant isolation since outcomes table doesn't carry org_id directly.
    let q = admin
      .from("bot_outcomes")
      .select("id, bot_id, conversation_id, contact_id, type, payload, created_at, bots!bot_outcomes_bot_id_fkey!inner(org_id)")
      .eq("bots.org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (botId) q = q.eq("bot_id", botId);
    if (type) q = q.eq("type", type);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    if (cursor) {
      q = q.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
      );
    }
    const { data } = await q;
    const rows = (data ?? []) as Array<{
      id: string;
      bot_id: string;
      conversation_id: string | null;
      contact_id: string | null;
      type: string;
      payload: unknown;
      created_at: string;
    }>;
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      object: "list",
      data: page.map(shapeOutcome),
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeCursor({ id: last.id, created_at: last.created_at }) : null,
    };
  },
});
