import { NextResponse, type NextRequest } from "next/server";
import { finishCalendarOAuth } from "@/lib/calendar/oauth-flow";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const path = await finishCalendarOAuth(req, "google");
  return NextResponse.redirect(new URL(path, req.url).toString());
}
