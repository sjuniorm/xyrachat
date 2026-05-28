import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "@/lib/api/errors";
import { shapeChannel } from "@/lib/api/shapes";

export const runtime = "nodejs";

export const GET = apiHandler({
  scopes: ["channels:read"],
  handler: async (_req, ctx, params) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("channels")
      .select("id, type, name, active, created_at, org_id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data || data.org_id !== ctx.orgId) return notFound("Channel not found.");
    return shapeChannel(data);
  },
});
