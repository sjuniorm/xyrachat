import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeCursor, encodeCursor, parseLimit } from "@/lib/api/pagination";
import { invalidRequest, unprocessable } from "@/lib/api/errors";
import { shapeBroadcast } from "@/lib/api/shapes";
import { getCachedIdempotentResponse, storeIdempotentResponse } from "@/lib/api/idempotency";

export const runtime = "nodejs";

const BC_COLS =
  "id, channel_id, template_id, name, status, scheduled_at, started_at, finished_at, total_count, sent_count, failed_count, created_at";

export const GET = apiHandler({
  scopes: ["broadcasts:read"],
  handler: async (req, ctx) => {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorRaw = url.searchParams.get("cursor");
    const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
    if (cursorRaw && !cursor) return invalidRequest("invalid_cursor", "Cursor is malformed.");
    const admin = createAdminClient();
    let q = admin
      .from("broadcasts")
      .select(BC_COLS)
      .eq("org_id", ctx.orgId)
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
      data: page.map(shapeBroadcast),
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeCursor({ id: last.id, created_at: last.created_at }) : null,
    };
  },
});

// POST /api/v1/broadcasts — create a draft.
// body: { name, channel_id, template_id, variable_mapping?, audience_filter?, scheduled_at? }
export const POST = apiHandler({
  scopes: ["broadcasts:write"],
  handler: async (req, ctx) => {
    const idempotencyKey = req.headers.get("idempotency-key");
    const cached = await getCachedIdempotentResponse(ctx.apiKeyId, idempotencyKey);
    if (cached) {
      return new Response(JSON.stringify(cached.body), {
        status: cached.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    let body: {
      name?: string;
      channel_id?: string;
      template_id?: string;
      variable_mapping?: Record<string, unknown>;
      audience_filter?: Record<string, unknown>;
      scheduled_at?: string | null;
    };
    try {
      body = await req.json();
    } catch {
      return invalidRequest("invalid_json", "Request body must be valid JSON.");
    }
    if (!body.name?.trim() || !body.channel_id || !body.template_id) {
      return invalidRequest("missing_field", "name, channel_id and template_id are required.");
    }
    const admin = createAdminClient();
    // Verify channel + template org match.
    const [{ data: ch }, { data: tpl }] = await Promise.all([
      admin.from("channels").select("id, org_id, type").eq("id", body.channel_id).maybeSingle(),
      admin
        .from("wa_templates")
        .select("id, org_id, meta_status, channel_id")
        .eq("id", body.template_id)
        .maybeSingle(),
    ]);
    if (!ch || ch.org_id !== ctx.orgId) return invalidRequest("channel_not_in_org", "Channel not in your org.", "channel_id");
    if (!tpl || tpl.org_id !== ctx.orgId) return invalidRequest("template_not_in_org", "Template not in your org.", "template_id");
    if (tpl.meta_status !== "APPROVED") {
      return unprocessable(
        "template_not_approved",
        `Template must be Meta-approved before sending (currently ${tpl.meta_status}).`,
        "template_id",
      );
    }
    if (tpl.channel_id !== ch.id) {
      return unprocessable(
        "template_channel_mismatch",
        "Template was created on a different channel.",
        "template_id",
      );
    }
    const status = body.scheduled_at ? "scheduled" : "draft";
    const { data, error } = await admin
      .from("broadcasts")
      .insert({
        org_id: ctx.orgId,
        channel_id: body.channel_id,
        template_id: body.template_id,
        name: body.name.trim(),
        variable_mapping: body.variable_mapping ?? {},
        audience_filter: body.audience_filter ?? { all: true },
        status,
        scheduled_at: body.scheduled_at ?? null,
        // total_count gets filled when we launch + resolve the audience.
      })
      .select(BC_COLS)
      .single();
    if (error) {
      return new Response(JSON.stringify({ error: { type: "internal", code: "db_error", message: error.message } }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const resBody = shapeBroadcast(data);
    void storeIdempotentResponse(ctx.apiKeyId, idempotencyKey, { status: 201, body: resBody });
    return new Response(JSON.stringify(resBody), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  },
});
