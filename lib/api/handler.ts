import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey, logApiRequest, type ApiKeyContext } from "./auth";
import type { Scope } from "./scopes";

// Wrap a route handler so every request gets:
//  - bearer-token auth + scope check
//  - automatic timing + request log
//  - rate-limit headers (stub values until Upstash lands)
//  - consistent error catching so a thrown exception becomes a 500
//    rather than an unhandled rejection
//
// Handlers return either a NextResponse directly or a JSON-able object
// (in which case 200 OK is sent). For non-200 results, return the
// NextResponse from one of the helpers in errors.ts.
type Handler = (
  req: NextRequest,
  ctx: ApiKeyContext,
  params: Record<string, string>,
) => Promise<NextResponse | unknown>;

export function apiHandler(opts: {
  scopes?: Scope[];
  handler: Handler;
}) {
  return async function wrapped(
    req: NextRequest,
    { params }: { params?: Promise<Record<string, string>> } = {},
  ) {
    const start = Date.now();
    const resolvedParams = (await params) ?? {};
    const auth = await requireApiKey(req, ...(opts.scopes ?? []));
    if (!auth.ok) {
      void logApiRequest({
        apiKeyId: null,
        orgId: null,
        method: req.method,
        path: new URL(req.url).pathname,
        status: auth.response.status,
        durationMs: Date.now() - start,
        ip: req.headers.get("x-forwarded-for"),
        userAgent: req.headers.get("user-agent"),
        idempotencyKey: req.headers.get("idempotency-key"),
      });
      return auth.response;
    }

    let res: NextResponse;
    try {
      const out = await opts.handler(req, auth.ctx, resolvedParams);
      res = out instanceof NextResponse ? out : NextResponse.json(out);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[api] handler crashed", message);
      res = NextResponse.json(
        { error: { type: "internal", code: "internal_error", message: "Something went wrong." } },
        { status: 500 },
      );
    }

    // Stub rate-limit headers — real per-key sliding-window lands when
    // Upstash is configured. Headers are still useful for client SDKs to
    // start parsing now so the API surface stays stable later.
    res.headers.set("X-RateLimit-Limit", "600");
    res.headers.set("X-RateLimit-Remaining", "600");
    res.headers.set(
      "X-RateLimit-Reset",
      String(Math.floor(Date.now() / 1000) + 60),
    );

    void logApiRequest({
      apiKeyId: auth.ctx.apiKeyId,
      orgId: auth.ctx.orgId,
      method: req.method,
      path: new URL(req.url).pathname,
      status: res.status,
      durationMs: Date.now() - start,
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
      idempotencyKey: req.headers.get("idempotency-key"),
    });
    return res;
  };
}
