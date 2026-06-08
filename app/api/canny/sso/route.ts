import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { getRouteUser } from "@/lib/supabase/route-auth";

export const runtime = "nodejs";

// GET /api/canny/sso — returns a Canny SSO token (HS256 JWT signed with
// CANNY_PRIVATE_KEY) identifying the signed-in user, so the embedded roadmap
// board (/roadmap) recognizes them without a separate Canny sign-up. Returns
// { configured:false } when Canny isn't set up yet (the board shows read-only).
function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.CANNY_PRIVATE_KEY;
  if (!key) return NextResponse.json({ configured: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const token = signHs256(
    {
      id: user.id,
      email: profile?.email ?? user.email ?? "",
      name: profile?.full_name ?? "Xyra Chat user",
      ...(profile?.avatar_url ? { avatarURL: profile.avatar_url } : {}),
    },
    key,
  );
  return NextResponse.json({ configured: true, token });
}
