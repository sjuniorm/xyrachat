import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey, logApiRequest } from "@/lib/api/auth";

// GET /api/v1/me — whoami. The first call every integration makes to
// verify the API key works + see what it can do.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = await requireApiKey(req);
  if (!auth.ok) {
    void logApiRequest({
      apiKeyId: null,
      orgId: null,
      method: "GET",
      path: "/api/v1/me",
      status: 401,
      durationMs: Date.now() - start,
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
      idempotencyKey: null,
    });
    return auth.response;
  }
  const body = {
    object: "api_key",
    id: auth.ctx.apiKeyId,
    org_id: auth.ctx.orgId,
    name: auth.ctx.name,
    scopes: auth.ctx.scopes,
  };
  void logApiRequest({
    apiKeyId: auth.ctx.apiKeyId,
    orgId: auth.ctx.orgId,
    method: "GET",
    path: "/api/v1/me",
    status: 200,
    durationMs: Date.now() - start,
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    idempotencyKey: null,
  });
  return NextResponse.json(body);
}
