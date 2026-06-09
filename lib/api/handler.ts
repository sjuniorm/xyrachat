import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey, logApiRequest, type ApiKeyContext } from "./auth";
import { rateLimited } from "./errors";
import { rateLimit } from "@/lib/rate-limit";
import type { Scope } from "./scopes";

// Per-key sliding-window limits (separate read/write buckets so a write flood
// can't starve reads). Fails OPEN until Upstash is configured.
const READ_LIMIT = 600; // GET/HEAD per minute per key
const WRITE_LIMIT = 120; // mutating methods per minute per key

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

    // Enforce per-key rate limit (was a stub header before).
    const isWrite = !["GET", "HEAD"].includes(req.method.toUpperCase());
    const limit = isWrite ? WRITE_LIMIT : READ_LIMIT;
    const rl = await rateLimit(isWrite ? "api:write" : "api:read", auth.ctx.apiKeyId, {
      limit,
      windowSec: 60,
    });
    if (!rl.ok) {
      const limited = rateLimited(rl.retryAfter);
      limited.headers.set("X-RateLimit-Limit", String(limit));
      limited.headers.set("X-RateLimit-Remaining", "0");
      limited.headers.set("X-RateLimit-Reset", String(Math.floor(Date.now() / 1000) + rl.retryAfter));
      void logApiRequest({
        apiKeyId: auth.ctx.apiKeyId,
        orgId: auth.ctx.orgId,
        method: req.method,
        path: new URL(req.url).pathname,
        status: 429,
        durationMs: Date.now() - start,
        ip: req.headers.get("x-forwarded-for"),
        userAgent: req.headers.get("user-agent"),
        idempotencyKey: req.headers.get("idempotency-key"),
      });
      return limited;
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

    // Rate-limit headers. Limit + Reset are exact; Remaining is approximate
    // (the shared limiter abstracts the count) — enforcement happens in the
    // 429 path above, these are informational for client SDKs.
    res.headers.set("X-RateLimit-Limit", String(limit));
    res.headers.set("X-RateLimit-Remaining", String(limit));
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
