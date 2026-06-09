import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { requireApiKey, logApiRequest } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSafeOutboundUrl } from "@/lib/api/ssrf";
import { EVENT_TYPES, type EventType } from "@/lib/api/events";
import { invalidRequest, rateLimited } from "@/lib/api/errors";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/v1/webhooks/subscribe — Make / Zapier / n8n connectors call
// this when a scenario / Zap / workflow activates. Returns the secret
// ONCE so the consumer can verify signatures.
//
// `source` is inferred from the X-Xyra-Source header so the dashboard
// can label rows ("Created by Make.com" vs "Created via dashboard").
export async function POST(req: NextRequest) {
  const start = Date.now();
  const auth = await requireApiKey(req, "webhooks:write");
  if (!auth.ok) return auth.response;

  // This route registers outbound endpoints + is an SSRF-validation surface —
  // throttle per key (this route doesn't go through apiHandler). Fails open
  // until Upstash is set.
  const rl = await rateLimit("api:webhooks:subscribe", auth.ctx.apiKeyId, {
    limit: 30,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimited(rl.retryAfter);

  let body: {
    url?: string;
    events?: string[];
    filters?: Record<string, unknown>;
    label?: string;
  };
  try {
    body = await req.json();
  } catch {
    return invalidRequest("invalid_json", "Request body must be valid JSON.");
  }
  if (!body.url || !body.events || body.events.length === 0) {
    return invalidRequest("missing_field", "url and events are required.");
  }
  try {
    await assertSafeOutboundUrl(body.url);
  } catch (err) {
    return invalidRequest(
      "invalid_url",
      err instanceof Error ? err.message : "Invalid URL.",
      "url",
    );
  }
  for (const e of body.events) {
    if (!EVENT_TYPES.includes(e as EventType)) {
      return invalidRequest("unknown_event", `Unknown event: ${e}`, "events");
    }
  }
  const sourceHeader = (req.headers.get("x-xyra-source") ?? "api").toLowerCase();
  const source = ["make", "zapier", "n8n", "api"].includes(sourceHeader)
    ? sourceHeader
    : "api";

  const secret = randomBytes(32).toString("hex");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("webhook_endpoints")
    .insert({
      org_id: auth.ctx.orgId,
      name: body.label ?? null,
      url: body.url,
      events: body.events,
      filters: body.filters ?? {},
      secret,
      source,
    })
    .select("id, events, filters, source")
    .single();
  if (error) {
    return NextResponse.json(
      { error: { type: "internal", code: "db_error", message: error.message } },
      { status: 500 },
    );
  }
  void logApiRequest({
    apiKeyId: auth.ctx.apiKeyId,
    orgId: auth.ctx.orgId,
    method: "POST",
    path: "/api/v1/webhooks/subscribe",
    status: 201,
    durationMs: Date.now() - start,
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    idempotencyKey: null,
  });
  return NextResponse.json(
    {
      object: "webhook_endpoint",
      id: data.id,
      secret,
      events: data.events,
      filters: data.filters,
      source: data.source,
    },
    { status: 201 },
  );
}
