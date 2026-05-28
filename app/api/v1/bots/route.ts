import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { shapeBot } from "@/lib/api/shapes";

export const runtime = "nodejs";

export const GET = apiHandler({
  scopes: ["bots:read"],
  handler: async (_req, ctx) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("bots")
      .select("id, name, objective, active, knowledge_threshold, language, created_at")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    return {
      object: "list",
      data: (data ?? []).map(shapeBot),
      has_more: false,
      next_cursor: null,
    };
  },
});
