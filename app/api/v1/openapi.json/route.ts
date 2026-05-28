import { NextResponse } from "next/server";
import { OPENAPI_SPEC } from "@/lib/api/openapi";

export const runtime = "nodejs";

// Public — no auth needed. Connectors (Make / Zapier / n8n) introspect
// this to keep their wrappers in sync with our schema.
export async function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
