import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { redeemPromo } from "@/lib/billing/promo";

export const runtime = "nodejs";

// Per-user rate limit: 5 attempts/hour. In-memory (per serverless
// instance) — a speed bump against brute-forcing valid codes. Real
// distributed limiting via Upstash is on the pre-launch list; the
// stronger protections are already in place: generic "invalid or
// expired" errors (no enumeration signal) + Stripe-enforced redemption
// caps + one-redemption-per-org dedupe.
const attempts = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(userId, recent);
  return recent.length > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 });
  // Only owners manage billing/promos.
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can redeem codes." },
      { status: 403 },
    );
  }

  if (rateLimited(user.id)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in an hour." },
      { status: 429 },
    );
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.code?.trim()) {
    return NextResponse.json({ error: "Enter a code." }, { status: 400 });
  }

  const res = await redeemPromo(profile.org_id, body.code);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true, message: res.message });
}
