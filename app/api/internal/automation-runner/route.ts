import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { resumeAutomation } from "@/lib/automations/executor";
import type { Action } from "@/lib/automations/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/internal/automation-runner — resumes due, post-"wait" automation
// steps. Called by pg_cron (migration 037) every minute. Atomically claims
// pending rows whose run_at has passed (pending → processing) so overlapping
// invocations can't double-fire, resumes each, then marks done/failed.

// Each row may do several provider sends (~1-2s); keep the batch well inside
// the 60s function budget. Leftovers are picked up on the next minute's tick.
const MAX_BATCH = 25;
const MAX_ATTEMPTS = 5; // a row that keeps throwing is parked as failed
// Rows stuck in 'processing' (crashed/timed-out run) are reclaimed after this.
const STALE_PROCESSING_MS = 5 * 60 * 1000;

type SchedRow = {
  id: string;
  automation_id: string;
  org_id: string;
  contact_id: string;
  channel_id: string;
  conversation_id: string | null;
  remaining_actions: Action[];
  trigger_data: Record<string, unknown> | null;
  attempts: number;
};

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
  }
  // Constant-time compare so the long-lived CRON_SECRET isn't probeable via
  // response-timing on this internet-reachable endpoint.
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Reclaim rows stranded in 'processing' by a crashed/timed-out prior run so
  // they get retried instead of being stuck forever.
  await admin
    .from("automation_scheduled_actions")
    .update({ status: "pending", updated_at: nowIso })
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - STALE_PROCESSING_MS).toISOString());

  // Atomic claim: flip pending → processing for due rows in one UPDATE.
  // Row-level locks mean a concurrent runner claims a disjoint set (or none).
  // NOTE: PostgREST requires an explicit .order() whenever .limit() is used on
  // a mutation (limited UPDATE) — without it the request 400s.
  const { data: claimed, error: claimErr } = await admin
    .from("automation_scheduled_actions")
    .update({ status: "processing", updated_at: nowIso })
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .order("id", { ascending: true })
    .select(
      "id, automation_id, org_id, contact_id, channel_id, conversation_id, remaining_actions, trigger_data, attempts",
    )
    .limit(MAX_BATCH);
  if (claimErr) {
    return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 });
  }

  const rows = (claimed ?? []) as SchedRow[];
  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await resumeAutomation({
        scheduled_action_id: row.id,
        automation_id: row.automation_id,
        org_id: row.org_id,
        contact_id: row.contact_id,
        channel_id: row.channel_id,
        conversation_id: row.conversation_id,
        remaining_actions: row.remaining_actions ?? [],
        trigger_data: row.trigger_data,
      });
      const attempts = row.attempts + 1;
      // Status mapping:
      //  - skipped  → cancelled (automation deleted/deactivated — terminal)
      //  - failed   → retry (back to pending) until MAX_ATTEMPTS, then failed.
      //               Sends are idempotent (stamped per scheduled step), so a
      //               retry only re-sends what didn't land.
      //  - success  → done
      const nextStatus =
        result.status === "skipped"
          ? "cancelled"
          : result.status === "failed"
            ? attempts >= MAX_ATTEMPTS
              ? "failed"
              : "pending"
            : "done";
      await admin
        .from("automation_scheduled_actions")
        .update({
          status: nextStatus,
          last_error: result.error_message,
          attempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      processed += 1;
      if (result.status === "failed") failed += 1;
    } catch (err) {
      // Unexpected throw — retry up to MAX_ATTEMPTS by returning it to
      // 'pending', else park it as 'failed' so it can't loop forever.
      const attempts = row.attempts + 1;
      await admin
        .from("automation_scheduled_actions")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          last_error: err instanceof Error ? err.message : "runner error",
          attempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, claimed: rows.length, processed, failed });
}

// Allow GET for manual/health checks (same auth).
export async function GET(req: NextRequest) {
  return POST(req);
}
