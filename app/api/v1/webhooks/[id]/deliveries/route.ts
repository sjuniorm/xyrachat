import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, invalidRequest } from "@/lib/api/errors";
import { decodeCursor, encodeCursor, parseLimit } from "@/lib/api/pagination";
import { shapeDelivery } from "@/lib/api/shapes";

export const runtime = "nodejs";

// GET /api/v1/webhooks/:id/deliveries — paginated delivery audit log.
export const GET = apiHandler({
  scopes: ["webhooks:read"],
  handler: async (req, ctx, params) => {
    const admin = createAdminClient();
    const { data: ep } = await admin
      .from("webhook_endpoints")
      .select("id, org_id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!ep || ep.org_id !== ctx.orgId) return notFound("Webhook endpoint not found.");

    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorRaw = url.searchParams.get("cursor");
    const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
    if (cursorRaw && !cursor) return invalidRequest("invalid_cursor", "Cursor is malformed.");
    const status = url.searchParams.get("status");

    let q = admin
      .from("webhook_deliveries")
      .select(
        "id, webhook_endpoint_id, event_type, event_id, attempt, status, response_status, response_body_excerpt, next_retry_at, delivered_at, created_at",
      )
      .eq("webhook_endpoint_id", params.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (status) q = q.eq("status", status);
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
      data: page.map(shapeDelivery),
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeCursor({ id: last.id, created_at: last.created_at }) : null,
    };
  },
});
