import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, unprocessable } from "@/lib/api/errors";

export const runtime = "nodejs";

// POST /api/v1/broadcasts/:id/launch — fire-and-forget by calling the
// existing /api/broadcasts/send-internal endpoint with CRON_SECRET. Lets
// API clients trigger a draft broadcast the same way the cron worker does.
export const POST = apiHandler({
  scopes: ["broadcasts:write"],
  handler: async (req, ctx, params) => {
    const admin = createAdminClient();
    const { data: bc } = await admin
      .from("broadcasts")
      .select("id, org_id, status")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!bc || bc.org_id !== ctx.orgId) return notFound("Broadcast not found.");
    if (bc.status === "sending" || bc.status === "done") {
      return unprocessable(
        "already_running",
        `Broadcast is already ${bc.status}.`,
      );
    }
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return unprocessable(
        "server_not_configured",
        "Broadcast launching requires CRON_SECRET on the server.",
      );
    }
    // Flag as sending pessimistically; the send-internal route picks it up.
    await admin.from("broadcasts").update({ status: "sending" }).eq("id", params.id);
    const internalUrl = new URL("/api/broadcasts/send-internal", req.url);
    void fetch(internalUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ broadcastId: params.id }),
    }).catch(() => null);
    return { object: "broadcast", id: params.id, status: "sending" };
  },
});
