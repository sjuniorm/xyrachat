import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Lazy Upstash Redis singleton. Null when not configured.
let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

const limiters = new Map<string, Ratelimit>();
function limiterFor(
  name: string,
  limit: number,
  windowSec: number,
): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  const cacheKey = `${name}:${limit}:${windowSec}`;
  let l = limiters.get(cacheKey);
  if (!l) {
    l = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: `xyra:rl:${name}`,
      analytics: false,
    });
    limiters.set(cacheKey, l);
  }
  return l;
}

export type RateResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Rate-limit `identifier` (org id / user id / api-key id / IP) within a named
 * bucket using a sliding window.
 *
 * FAILS OPEN when Upstash isn't configured (UPSTASH_REDIS_REST_URL/TOKEN unset)
 * or on a transient Redis error — over-serving once beats blocking a paying
 * customer on an infra blip. So this is a safety throttle, not an auth gate.
 */
export async function rateLimit(
  name: string,
  identifier: string,
  opts: { limit: number; windowSec: number },
): Promise<RateResult> {
  const l = limiterFor(name, opts.limit, opts.windowSec);
  if (!l) return { ok: true };
  try {
    const res = await l.limit(identifier);
    if (res.success) return { ok: true };
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
    return { ok: false, retryAfter };
  } catch {
    return { ok: true };
  }
}

/** Best-effort client IP from standard proxy headers (Vercel sets these). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
