import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { shapeChannel } from "@/lib/api/shapes";

export const runtime = "nodejs";

// GET /api/v1/channels — non-paginated; orgs rarely have >50 channels.
export const GET = apiHandler({
  scopes: ["channels:read"],
  handler: async (_req, ctx) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("channels")
      .select("id, type, name, active, created_at")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    return {
      object: "list",
      data: (data ?? []).map(shapeChannel),
      has_more: false,
      next_cursor: null,
    };
  },
});
