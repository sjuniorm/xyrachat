import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Begins the redirect-based Facebook Login for Business flow for Messenger.
// Unlike the JS-SDK popup (which binds the code to a redirect_uri the SDK won't
// expose, causing "redirect_uri identical" on exchange), here WE set + register
// the redirect_uri, so the callback's token exchange matches exactly.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const appId = process.env.NEXT_PUBLIC_META_APP_ID ?? process.env.META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_MESSENGER_OAUTH_CONFIG_ID;
  if (!appId || !configId) {
    // One-click not configured — fall back to the manual connect form.
    return NextResponse.redirect(
      new URL("/settings/channels/messenger/new?reason=no-oauth", req.url),
    );
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = absoluteUrl(req, "/api/auth/messenger/callback");

  // Facebook Login for Business dialog — config_id carries the permission set
  // (pages_show_list, pages_messaging, pages_manage_metadata, business_management)
  // configured in the dashboard.
  const dialog = new URL("https://www.facebook.com/v22.0/dialog/oauth");
  dialog.searchParams.set("client_id", appId);
  dialog.searchParams.set("config_id", configId);
  dialog.searchParams.set("redirect_uri", redirectUri);
  dialog.searchParams.set("response_type", "code");
  dialog.searchParams.set("state", state);

  const res = NextResponse.redirect(dialog.toString());
  res.cookies.set("msgr_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/api/auth/messenger",
  });
  return res;
}

function absoluteUrl(req: NextRequest, path: string): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}${path}`;
}
