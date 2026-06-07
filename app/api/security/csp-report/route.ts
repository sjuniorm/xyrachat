import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";

// Ingests browser CSP violation reports (from the Content-Security-Policy-
// Report-Only header's report-uri) and forwards a compact summary to Sentry, so
// real policy gaps + attack attempts surface before we flip CSP to enforced.
// Public (browsers POST without auth); body is untrusted + only summarized.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    // Both legacy ({ "csp-report": {...} }) and Reporting-API shapes.
    const raw =
      body && typeof body === "object" && "csp-report" in body
        ? (body["csp-report"] as unknown)
        : body;
    const report: Record<string, unknown> =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const directive =
      (report["violated-directive"] as string | undefined) ??
      (report["effectiveDirective"] as string | undefined) ??
      "unknown";
    const blocked =
      (report["blocked-uri"] as string | undefined) ??
      (report["blockedURL"] as string | undefined) ??
      "unknown";
    const docUri =
      (report["document-uri"] as string | undefined) ??
      (report["documentURL"] as string | undefined) ??
      "unknown";

    Sentry.captureMessage(`CSP violation: ${directive}`, {
      level: "warning",
      tags: { kind: "csp-report" },
      extra: { directive, blocked, document: docUri },
    });
  } catch {
    // Never error on a malformed report.
  }
  // 204 — browsers ignore the body of a report response.
  return new NextResponse(null, { status: 204 });
}
