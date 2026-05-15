import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Instagram Business Login scopes. These are NOT the same as the legacy
// Facebook Login scopes that we tried first — they live under the
// "Instagram Login" product, not "Facebook Login for Business".
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

// Kicks off Instagram Business Login. Meta hosts the authorize page on
// instagram.com itself (NOT facebook.com) — this is the modern direct
// path that works for Instagram-only Meta apps with no linked Facebook
// Page. We set a state cookie for CSRF and redirect to the IG dialog.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/settings/channels/instagram/new?reason=no-oauth", req.url),
    );
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = absoluteUrl(req, "/api/auth/instagram/callback");

  const dialog = new URL("https://www.instagram.com/oauth/authorize");
  dialog.searchParams.set("client_id", appId);
  dialog.searchParams.set("redirect_uri", redirectUri);
  dialog.searchParams.set("scope", SCOPES);
  dialog.searchParams.set("response_type", "code");
  dialog.searchParams.set("state", state);

  const res = NextResponse.redirect(dialog.toString());
  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/api/auth/instagram",
  });
  return res;
}

function absoluteUrl(req: NextRequest, path: string): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}${path}`;
}
