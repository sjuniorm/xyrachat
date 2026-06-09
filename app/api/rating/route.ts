import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const TOKEN_RE = /^[a-f0-9]{32}$/;

// Public: a customer submits their rating from /rate/<token>. The token is the
// bearer — no session. Records once (idempotent: only updates an un-rated row).
export async function POST(req: Request) {
  let body: { token?: string; score?: number; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { token } = body;
  const score = Number(body.score);
  const comment = (body.comment ?? "").toString().trim().slice(0, 1000) || null;

  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }
  if (!Number.isInteger(score)) {
    return NextResponse.json({ error: "Pick a score" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: rating } = await admin
    .from("conversation_ratings")
    .select("id, kind, rated_at")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!rating) return NextResponse.json({ error: "Link not found" }, { status: 404 });
  if (rating.rated_at) return NextResponse.json({ ok: true, already: true });

  const max = rating.kind === "nps" ? 10 : 5;
  const min = rating.kind === "nps" ? 0 : 1;
  if (score < min || score > max) {
    return NextResponse.json({ error: "Score out of range" }, { status: 400 });
  }

  // Conditional update — only set the score if still un-rated (idempotent vs a
  // double submit / re-delivery).
  const { error } = await admin
    .from("conversation_ratings")
    .update({ score, comment, rated_at: new Date().toISOString() })
    .eq("id", rating.id)
    .is("rated_at", null);
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
