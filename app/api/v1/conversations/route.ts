import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey, logApiRequest } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeCursor, encodeCursor, parseLimit } from "@/lib/api/pagination";
import { invalidRequest } from "@/lib/api/errors";

export const runtime = "nodejs";

// GET /api/v1/conversations — cursor paginated, sorted by last_message_at desc.
export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = await requireApiKey(req, "conversations:read");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) {
    return invalidRequest("invalid_cursor", "Cursor is malformed.");
  }
  const status = url.searchParams.get("status");
  const channelId = url.searchParams.get("channel_id");

  const admin = createAdminClient();
  let q = admin
    .from("conversations")
    .select(
      "id, org_id, channel_id, contact_id, assigned_to, status, last_message_at, last_inbound_at, snooze_until, created_at",
    )
    .eq("org_id", auth.ctx.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (status) q = q.eq("status", status);
  if (channelId) q = q.eq("channel_id", channelId);
  if (cursor) {
    q = q.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: { type: "internal", code: "db_error", message: error.message } },
      { status: 500 },
    );
  }
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({ id: last.id, created_at: last.created_at })
    : null;

  void logApiRequest({
    apiKeyId: auth.ctx.apiKeyId,
    orgId: auth.ctx.orgId,
    method: "GET",
    path: "/api/v1/conversations",
    status: 200,
    durationMs: Date.now() - start,
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    idempotencyKey: null,
  });
  return NextResponse.json({
    object: "list",
    data: page.map(shapeConversation),
    has_more: hasMore,
    next_cursor: nextCursor,
  });
}

function shapeConversation(c: {
  id: string;
  channel_id: string;
  contact_id: string;
  assigned_to: string | null;
  status: string;
  last_message_at: string;
  last_inbound_at: string | null;
  snooze_until: string | null;
  created_at: string;
}) {
  return {
    object: "conversation",
    id: c.id,
    channel_id: c.channel_id,
    contact_id: c.contact_id,
    assigned_to: c.assigned_to,
    status: c.status,
    last_message_at: c.last_message_at,
    last_inbound_at: c.last_inbound_at,
    snooze_until: c.snooze_until,
    created_at: c.created_at,
  };
}
