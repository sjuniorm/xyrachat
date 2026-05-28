import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, invalidRequest } from "@/lib/api/errors";
import { decodeCursor, encodeCursor, parseLimit } from "@/lib/api/pagination";
import { shapeMessage } from "@/lib/api/shapes";

export const runtime = "nodejs";

const MSG_COLS =
  "id, conversation_id, direction, content, media_url, media_type, sender_type, status, wa_message_id, ig_message_id, telegram_message_id, is_internal_note, metadata, created_at";

// GET /api/v1/conversations/:id/messages — paginated, newest first.
export const GET = apiHandler({
  scopes: ["messages:read"],
  handler: async (req, ctx, params) => {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorRaw = url.searchParams.get("cursor");
    const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
    if (cursorRaw && !cursor) {
      return invalidRequest("invalid_cursor", "Cursor is malformed.");
    }
    const admin = createAdminClient();
    // Verify conversation belongs to caller's org.
    const { data: conv } = await admin
      .from("conversations")
      .select("id, org_id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!conv || conv.org_id !== ctx.orgId) return notFound("Conversation not found.");

    let q = admin
      .from("messages")
      .select(MSG_COLS)
      .eq("conversation_id", params.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (cursor) {
      q = q.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
      );
    }
    const { data } = await q;
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      object: "list",
      data: page.map(shapeMessage),
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeCursor({ id: last.id, created_at: last.created_at }) : null,
    };
  },
});
