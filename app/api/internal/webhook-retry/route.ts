import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSafeOutboundUrl } from "@/lib/api/ssrf";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/internal/webhook-retry — drains the webhook_deliveries queue.
// Called by pg_cron (or VPS / external scheduler) every minute. Picks
// up to 100 deliveries with status in (pending, retrying) where
// next_retry_at <= NOW(), re-POSTs them, and updates state.
//
// Exponential backoff after each failure:
//   attempt 1 → +30s, 2 → 1m, 3 → 5m, 4 → 30m, 5 → 2h, 6 → 6h,
//   7 → 12h, 8 → 24h.  After 8 attempts → exhausted.

const BACKOFF_MS = [
  30_000, 60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 43_200_000, 86_400_000,
];
const MAX_ATTEMPTS = 8;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: due } = await admin
    .from("webhook_deliveries")
    .select(
      "id, webhook_endpoint_id, event_type, event_id, payload, attempt, webhook_endpoints!inner(url, secret, active, deleted_at)",
    )
    .in("status", ["pending", "retrying"])
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(100);

  let processed = 0;
  let succeeded = 0;
  let exhausted = 0;
  for (const raw of due ?? []) {
    type RowWithEndpoint = {
      id: string;
      webhook_endpoint_id: string;
      event_type: string;
      event_id: string;
      payload: Record<string, unknown>;
      attempt: number;
      webhook_endpoints: { url: string; secret: string; active: boolean; deleted_at: string | null };
    };
    const row = raw as unknown as RowWithEndpoint;
    processed += 1;
    const ep = row.webhook_endpoints;
    if (!ep.active || ep.deleted_at) {
      await admin
        .from("webhook_deliveries")
        .update({ status: "exhausted", response_body_excerpt: "Endpoint inactive" })
        .eq("id", row.id);
      exhausted += 1;
      continue;
    }

    // SSRF re-check at delivery time (DNS rebinding defense).
    let safeUrl: URL;
    try {
      safeUrl = await assertSafeOutboundUrl(ep.url);
    } catch (err) {
      await admin
        .from("webhook_deliveries")
        .update({
          status: "exhausted",
          response_body_excerpt: err instanceof Error ? err.message : "SSRF check failed",
        })
        .eq("id", row.id);
      exhausted += 1;
      continue;
    }

    const rawBody = JSON.stringify(row.payload);
    const ts = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", ep.secret)
      .update(`${ts}.${rawBody}`)
      .digest("hex");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let respStatus = 0;
    let respBody = "";
    let networkError: string | null = null;
    try {
      const res = await fetch(safeUrl.toString(), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Xyra-Event": row.event_type,
          "X-Xyra-Event-Id": row.event_id,
          "X-Xyra-Timestamp": String(ts),
          "X-Xyra-Signature": `t=${ts},v1=${signature}`,
          "User-Agent": "XyraChat-Webhook/1.0",
        },
        body: rawBody,
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
      await admin
        .from("webhook_deliveries")
        .update({
          status: "succeeded",
          response_status: respStatus,
          response_body_excerpt: respBody,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      await admin
        .from("webhook_endpoints")
        .update({ last_success_at: new Date().toISOString(), consecutive_failures: 0 })
        .eq("id", row.webhook_endpoint_id);
      succeeded += 1;
      continue;
    }

    if (gone) {
      await admin
        .from("webhook_deliveries")
        .update({
          status: "exhausted",
          response_status: respStatus,
          response_body_excerpt: respBody,
        })
        .eq("id", row.id);
      await admin
        .from("webhook_endpoints")
        .update({ active: false })
        .eq("id", row.webhook_endpoint_id);
      exhausted += 1;
      continue;
    }

    if (clientErr) {
      await admin
        .from("webhook_deliveries")
        .update({
          status: "failed",
          response_status: respStatus,
          response_body_excerpt: respBody,
        })
        .eq("id", row.id);
      continue;
    }

    // 5xx / network — bump attempt, schedule next retry or exhaust.
    const nextAttempt = row.attempt + 1;
    if (nextAttempt > MAX_ATTEMPTS) {
      await admin
        .from("webhook_deliveries")
        .update({
          status: "exhausted",
          response_status: respStatus || null,
          response_body_excerpt: networkError ?? respBody,
        })
        .eq("id", row.id);
      exhausted += 1;
      continue;
    }
    const nextRetry = new Date(Date.now() + BACKOFF_MS[nextAttempt - 1]).toISOString();
    await admin
      .from("webhook_deliveries")
      .update({
        status: "retrying",
        attempt: nextAttempt,
        response_status: respStatus || null,
        response_body_excerpt: networkError ?? respBody,
        next_retry_at: nextRetry,
      })
      .eq("id", row.id);
  }

  return NextResponse.json({
    ok: true,
    processed,
    succeeded,
    exhausted,
  });
}

// Also expose GET for cron systems that prefer GET (Vercel Cron on Pro,
// some self-hosted schedulers). Same auth, same behaviour.
export async function GET(req: NextRequest) {
  return POST(req);
}
