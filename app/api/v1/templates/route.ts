import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { shapeTemplate } from "@/lib/api/shapes";

export const runtime = "nodejs";

// GET /api/v1/templates — list WA templates, optionally filtered by channel.
export const GET = apiHandler({
  scopes: ["templates:read"],
  handler: async (req, ctx) => {
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channel_id");
    const status = url.searchParams.get("status");
    const admin = createAdminClient();
    let q = admin
      .from("wa_templates")
      .select("id, channel_id, name, language, category, meta_status, components, created_at")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (channelId) q = q.eq("channel_id", channelId);
    if (status) q = q.eq("meta_status", status);
    const { data } = await q;
    return {
      object: "list",
      data: (data ?? []).map(shapeTemplate),
      has_more: false,
      next_cursor: null,
    };
  },
});
