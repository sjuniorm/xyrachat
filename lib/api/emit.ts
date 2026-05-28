import "server-only";
import { randomUUID, createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSafeOutboundUrl } from "./ssrf";
import type { EventType } from "./events";

// Central event emitter. Called from every integration point that
// represents a state transition. Looks up subscribed endpoints,
// applies optional filters, queues + delivers.
//
// Delivery model on Hobby tier: we POST synchronously inline with a
// 10s timeout, and on failure we record the row with `retrying` +
// next_retry_at. A future retry worker (pg_cron + http extension, or
// VPS, or Vercel Pro Cron) drains the queue. Until that lands, the
// FIRST attempt is the only attempt — but it's recorded for replay so
// agents can manually re-fire from the dashboard.
//
// `data` is the fully-expanded resource payload. We don't auto-resolve
// FKs — callers pass in pre-shaped objects.

export async function emit(input: {
  type: EventType;
  orgId: string;
  data: Record<string, unknown>;
  previousAttributes?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, events, filters")
    .eq("org_id", input.orgId)
    .eq("active", true)
    .is("deleted_at", null)
    .contains("events", [input.type]);
  if (!endpoints || endpoints.length === 0) return;

  const eventId = randomUUID();
  const payload = {
    id: eventId,
    type: input.type,
    created: new Date().toISOString(),
    org_id: input.orgId,
    data: input.data,
    ...(input.previousAttributes ? { previous_attributes: input.previousAttributes } : {}),
  };
  const rawBody = JSON.stringify(payload);

  for (const ep of endpoints) {
    if (!filterMatches(ep.filters, input.data)) continue;
    void deliverOne({
      endpointId: ep.id,
      url: ep.url,
      secret: ep.secret,
      eventType: input.type,
      eventId,
      payload,
      rawBody,
    });
  }
}

// Apply per-endpoint filters. Filters are key→array; we treat every
// listed key as an AND, and any value within an array as an OR. Missing
// keys in the payload pass through (filter doesn't apply).
function filterMatches(
  filters: Record<string, unknown> | null,
  data: Record<string, unknown>,
): boolean {
  if (!filters) return true;
  for (const [key, vals] of Object.entries(filters)) {
    if (!Array.isArray(vals) || vals.length === 0) continue;
    const v = data[key];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) {
      // Tag-style arrays — match if any element overlaps.
      if (!v.some((x) => vals.includes(x))) return false;
    } else {
      if (!vals.includes(v)) return false;
    }
  }
  return true;
}

async function deliverOne(input: {
  endpointId: string;
  url: string;
  secret: string;
  eventType: string;
  eventId: string;
  payload: Record<string, unknown>;
  rawBody: string;
}): Promise<void> {
  const admin = createAdminClient();
  let url: URL;
  try {
    url = await assertSafeOutboundUrl(input.url);
  } catch (err) {
    await admin.from("webhook_deliveries").insert({
      webhook_endpoint_id: input.endpointId,
      event_type: input.eventType,
      event_id: input.eventId,
      payload: input.payload,
      attempt: 1,
      status: "failed",
      response_body_excerpt: err instanceof Error ? err.message : "SSRF check failed",
    });
    return;
  }

  const ts = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", input.secret)
    .update(`${ts}.${input.rawBody}`)
    .digest("hex");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let respStatus = 0;
  let respBody = "";
  let networkError: string | null = null;
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Xyra-Event": input.eventType,
        "X-Xyra-Event-Id": input.eventId,
        "X-Xyra-Timestamp": String(ts),
        "X-Xyra-Signature": `t=${ts},v1=${signature}`,
        "User-Agent": "XyraChat-Webhook/1.0",
      },
      body: input.rawBody,
    });
    respStatus = res.status;
    respBody = (await res.text().catch(() => "")).slice(0, 1024);
  } catch (err) {
    networkError = err instanceof Error ? err.message : "network error";
  } finally {
    clearTimeout(timer);
  }

  const ok = respStatus >= 200 && respStatus < 300;
  const gone = respStatus === 410;
  const clientErr = !ok && respStatus >= 400 && respStatus < 500 && !gone;

  if (ok) {
    await admin.from("webhook_deliveries").insert({
      webhook_endpoint_id: input.endpointId,
      event_type: input.eventType,
      event_id: input.eventId,
      payload: input.payload,
      attempt: 1,
      status: "succeeded",
      response_status: respStatus,
      response_body_excerpt: respBody,
      delivered_at: new Date().toISOString(),
    });
    await admin
      .from("webhook_endpoints")
      .update({
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
      })
      .eq("id", input.endpointId);
    return;
  }

  if (gone) {
    // 410 = consumer says "deactivate me forever". Honour it.
    await admin.from("webhook_deliveries").insert({
      webhook_endpoint_id: input.endpointId,
      event_type: input.eventType,
      event_id: input.eventId,
      payload: input.payload,
      attempt: 1,
      status: "exhausted",
      response_status: respStatus,
      response_body_excerpt: respBody,
    });
    await admin
      .from("webhook_endpoints")
      .update({ active: false })
      .eq("id", input.endpointId);
    return;
  }

  // Bump endpoint failure counter for the dashboard's health badge.
  // Read-modify-write is fine here — a missed bump under contention
  // is acceptable for a UI health signal (not a correctness invariant).
  const { data: prev } = await admin
    .from("webhook_endpoints")
    .select("consecutive_failures")
    .eq("id", input.endpointId)
    .maybeSingle();
  await admin
    .from("webhook_endpoints")
    .update({ consecutive_failures: (prev?.consecutive_failures ?? 0) + 1 })
    .eq("id", input.endpointId);

  if (clientErr) {
    // 4xx (not 410): consumer's bug; don't retry but record for replay.
    await admin.from("webhook_deliveries").insert({
      webhook_endpoint_id: input.endpointId,
      event_type: input.eventType,
      event_id: input.eventId,
      payload: input.payload,
      attempt: 1,
      status: "failed",
      response_status: respStatus,
      response_body_excerpt: respBody,
    });
    return;
  }

  // 5xx / network / timeout — queue for retry. Schedule first retry at
  // +30s; the retry worker (when wired up) drains pending rows on each tick.
  const nextRetry = new Date(Date.now() + 30_000).toISOString();
  await admin.from("webhook_deliveries").insert({
    webhook_endpoint_id: input.endpointId,
    event_type: input.eventType,
    event_id: input.eventId,
    payload: input.payload,
    attempt: 1,
    status: "retrying",
    response_status: respStatus || null,
    response_body_excerpt: networkError ?? respBody,
    next_retry_at: nextRetry,
  });
}
