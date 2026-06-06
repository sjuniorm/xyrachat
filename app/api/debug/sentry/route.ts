import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getRouteUser } from "@/lib/supabase/route-auth";

export const runtime = "nodejs";

// GET /api/debug/sentry — auth-gated verification that error reporting works
// end to end. Fires a synthetic server-side Sentry event and returns its id +
// whether a DSN is configured. Harmless: no data, no side effects; signed-in
// only so it can't be spammed anonymously. The client error boundaries
// (app/global-error.tsx, app/(dashboard)/error.tsx) cover client-side capture.
export async function GET(req: NextRequest) {
  const { user } = await getRouteUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = Sentry.captureException(
    new Error("Xyra Sentry test (server) — triggered from /api/debug/sentry"),
  );
  await Sentry.flush(2000).catch(() => {});

  const dsnConfigured = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
  return NextResponse.json({
    ok: true,
    eventId: eventId ?? null,
    dsnConfigured,
    note: dsnConfigured
      ? "Captured — check Sentry → Issues for the test event."
      : "Sentry is inert (no NEXT_PUBLIC_SENTRY_DSN set); set the DSN to enable reporting.",
  });
}
