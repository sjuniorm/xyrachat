import { NextResponse, type NextRequest } from "next/server";
import { finishCrmOAuth } from "@/lib/crm/oauth-flow";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const path = await finishCrmOAuth(req, "salesforce");
  return NextResponse.redirect(new URL(path, req.url).toString());
}
