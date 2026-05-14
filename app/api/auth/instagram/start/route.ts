import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Scopes for the Instagram Messaging API (riding on the Messenger Platform).
// Each one is reviewable by Meta — until App Review is passed we can only
// connect accounts that are Test Users on our Meta App.
const SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_messaging",
  "pages_show_list",
  "pages_manage_metadata",
].join(",");

// Kicks off the Facebook OAuth flow. We set a short-lived state cookie so the
// callback can verify the request originated from us (CSRF protection), then
// redirect the user to Facebook's OAuth dialog. After they authorize, Meta
// hits our /callback with ?code=...&state=... .
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/settings/channels/instagram/new?reason=no-oauth", req.url),
    );
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = absoluteUrl(req, "/api/auth/instagram/callback");

  const dialog = new URL("https://www.facebook.com/v22.0/dialog/oauth");
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
