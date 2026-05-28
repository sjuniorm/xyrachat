import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { shapeWebhookEndpoint } from "@/lib/api/shapes";

export const runtime = "nodejs";

// GET /api/v1/webhooks — list endpoints. Used by the dashboard
// integration tabs + connector status checks.
export const GET = apiHandler({
  scopes: ["webhooks:read"],
  handler: async (_req, ctx) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("webhook_endpoints")
      .select(
        "id, name, url, events, active, source, consecutive_failures, last_success_at, created_at",
      )
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    return {
      object: "list",
      data: (data ?? []).map(shapeWebhookEndpoint),
      has_more: false,
      next_cursor: null,
    };
  },
});
