import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Triggered by Supabase pg_cron (migration 065) every 5 min via the `http`
// extension, which sends `Authorization: Bearer ${CRON_SECRET}`. pg_cron is
// used instead of Vercel Cron because the Hobby tier blocks sub-daily Vercel
// crons (same reason as webhook-retry / sequences). Works on any Vercel plan.
//
// Endpoint is idempotent — running it twice for the same scheduled time
// is safe because the send path uses a single-winner atomic claim.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Reap broadcasts stuck in 'sending'. send-internal has maxDuration 300s,
  // so anything 'sending' with started_at older than 15 min means the
  // fire-and-forget dispatch died (cold-start abort, timeout). Reset to
  // 'scheduled' so this run re-dispatches it — send-internal skips
  // already-sent recipients, so re-dispatch can't double-send.
  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: stuck } = await admin
    .from("broadcasts")
    .update({ status: "scheduled", last_error: "Re-queued after a stalled send" })
    .eq("status", "sending")
    .lt("started_at", stuckCutoff)
    .is("deleted_at", null)
    .select("id");
  const reaped = (stuck ?? []).map((b) => b.id);

  const { data: due } = await admin
    .from("broadcasts")
    .select("id, name")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .is("deleted_at", null)
    .limit(10); // process in slices so one minute can't pile up

  const launched: string[] = [];
  for (const b of due ?? []) {
    // Do NOT pre-flip status — send-internal owns the single-winner atomic
    // claim. Two cron ticks both dispatching is harmless: the first POST
    // claims the row, the second matches 0 rows and 409s.
    const url = new URL("/api/broadcasts/send-internal", req.url);
    fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ broadcastId: b.id }),
    }).catch(() => {
      // best-effort; the stuck-sweeper above re-queues anything that stalls.
    });
    launched.push(b.id);
  }

  return NextResponse.json({ ok: true, launched, reaped });
}

// pg_cron's http extension issues a POST — same auth + logic as GET.
export async function POST(req: NextRequest) {
  return GET(req);
}
