import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST/GET /api/internal/retention-purge — CRON_SECRET-authed. Finds
// canceled subscriptions past their 30-day data_retention_until and
// runs the soft_delete_org cascade (migration 027) on each. Called daily
// by pg_cron (trigger_retention_purge) or manually for testing.
//
// Idempotent: soft_delete_org only touches rows where deleted_at IS NULL,
// and we clear data_retention_until after purging so an org is processed
// once.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: due } = await admin
    .from("subscriptions")
    .select("org_id")
    .eq("status", "canceled")
    .not("data_retention_until", "is", null)
    .lt("data_retention_until", new Date().toISOString())
    .limit(100);

  const purged: string[] = [];
  for (const row of due ?? []) {
    const orgId = row.org_id as string;
    const { error } = await admin.rpc("soft_delete_org", { p_org_id: orgId });
    if (error) {
      console.error("[retention-purge] soft_delete_org failed", orgId, error.message);
      continue;
    }
    // Clear the retention marker so we don't reprocess; keep the row for
    // billing history. (The org + its data are now soft-deleted.)
    await admin
      .from("subscriptions")
      .update({ data_retention_until: null })
      .eq("org_id", orgId);
    purged.push(orgId);
  }

  return NextResponse.json({ ok: true, purged_count: purged.length });
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
