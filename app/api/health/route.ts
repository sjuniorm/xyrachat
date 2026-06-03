import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import pkg from "@/package.json";

// Public, unauthenticated liveness/readiness probe. Pinged by Uptime Robot
// every few minutes. Checks that the app can reach Supabase. Returns 200 when
// healthy, 503 when the DB is unreachable so uptime monitors page on real
// outages (not just process-up).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let dbOk = false;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      version: pkg.version,
      db: dbOk ? "up" : "down",
      checked_in_ms: Date.now() - started,
      time: new Date().toISOString(),
    },
    {
      status: dbOk ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
