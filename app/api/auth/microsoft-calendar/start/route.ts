import { NextResponse, type NextRequest } from "next/server";
import { startCalendarOAuth } from "@/lib/calendar/oauth-flow";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const target = await startCalendarOAuth("microsoft");
  const dest = target.startsWith("http") ? target : new URL(target, req.url).toString();
  return NextResponse.redirect(dest);
}
