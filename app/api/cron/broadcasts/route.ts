import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Vercel Cron sets this header to a long-lived secret you also stash in
// CRON_SECRET. If you trigger from your VPS / Supabase pg_cron + http
// extension, send the same `Authorization: Bearer ${CRON_SECRET}` header.
//
// Endpoint is idempotent — running it twice for the same scheduled time
// is safe because /api/broadcasts/send refuses to send a broadcast that's
// already in `sending` or `done`.
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
  const { data: due } = await admin
    .from("broadcasts")
    .select("id, name")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .is("deleted_at", null)
    .limit(10); // process in slices so one minute can't pile up

  const launched: string[] = [];
  for (const b of due ?? []) {
    // Flip status pessimistically so a concurrent run doesn't double-fire.
    const { data: claim } = await admin
      .from("broadcasts")
      .update({ status: "sending" })
      .eq("id", b.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (!claim) continue;

    // Fire and forget — the send endpoint manages its own status updates.
    // We POST to ourselves with an internal-only header so /send accepts
    // it without an interactive session.
    const url = new URL("/api/broadcasts/send-internal", req.url);
    fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ broadcastId: b.id }),
    }).catch(() => {
      // best-effort; if this fails the broadcast will be left in
      // 'sending' — surface it on the list page with last_error.
    });
    launched.push(b.id);
  }

  return NextResponse.json({ ok: true, launched });
}
