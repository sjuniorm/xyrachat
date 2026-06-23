import { NextResponse, type NextRequest } from "next/server";
import { startCrmOAuth } from "@/lib/crm/oauth-flow";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const target = await startCrmOAuth("salesforce");
  const dest = target.startsWith("http") ? target : new URL(target, req.url).toString();
  return NextResponse.redirect(dest);
}
