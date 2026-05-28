import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey, logApiRequest } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "@/lib/api/errors";

export const runtime = "nodejs";

// DELETE /api/v1/webhooks/:id — connector calls this when its Zap /
// scenario / workflow turns off.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const start = Date.now();
  const auth = await requireApiKey(req, "webhooks:write");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("webhook_endpoints")
    .select("org_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row || row.org_id !== auth.ctx.orgId) {
    return notFound("Webhook endpoint not found.");
  }
  await admin
    .from("webhook_endpoints")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id);

  void logApiRequest({
    apiKeyId: auth.ctx.apiKeyId,
    orgId: auth.ctx.orgId,
    method: "DELETE",
    path: `/api/v1/webhooks/${id}`,
    status: 204,
    durationMs: Date.now() - start,
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    idempotencyKey: null,
  });
  return new NextResponse(null, { status: 204 });
}
