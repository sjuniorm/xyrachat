import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertCanAddChannel } from "@/lib/billing/gates";
import { listMessengerPages, connectMessengerPage } from "@/lib/messenger/connect";

export const runtime = "nodejs";

const META_GRAPH_VERSION = "v22.0";

// Facebook redirects here with ?code&state. We verify state, exchange the code
// for a user token (redirect_uri MATCHES the start route — no mismatch), list
// the user's Pages (pages_show_list), and connect. One Page → connect directly;
// multiple → stash the user token in a short-lived cookie and send the user to
// the chooser so they pick which Page (we never silently connect the wrong one).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    return redirectWithError(req, `Facebook denied the request: ${error}`);
  }
  if (!code || !state) return redirectWithError(req, "Missing code or state from Facebook.");

  const expectedState = req.cookies.get("msgr_oauth_state")?.value;
  if (!expectedState || expectedState !== state) {
    return redirectWithError(req, "OAuth state mismatch — please retry.");
  }

  const appId = process.env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return redirectWithError(req, "Messenger OAuth isn't configured (META_APP_ID/SECRET).");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id;
  if (!orgId) return redirectWithError(req, "You must belong to an organization.");

  const gate = await assertCanAddChannel(orgId, "facebook");
  if (!gate.ok) return redirectWithError(req, gate.error);

  // Exchange the code for a user token — redirect_uri is the SAME absolute URL
  // the start route sent, so Meta accepts it.
  const redirectUri = absoluteUrl(req, "/api/auth/messenger/callback");
  const exchRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    },
  );
  const exchJson = (await exchRes.json().catch(() => null)) as
    | { access_token?: string; error?: { message: string } }
    | null;
  if (!exchRes.ok || exchJson?.error || !exchJson?.access_token) {
    return redirectWithError(req, exchJson?.error?.message ?? `Token exchange failed (HTTP ${exchRes.status}).`);
  }
  const userToken = exchJson.access_token;

  const listed = await listMessengerPages(userToken);
  if (!listed.ok) return redirectWithError(req, listed.error);
  const pages = listed.pages;
  if (pages.length === 0) {
    return redirectWithError(req, "No Facebook Pages found on this account.");
  }

  // Single Page → connect it now.
  if (pages.length === 1) {
    const r = await connectMessengerPage(orgId, user.id, pages[0]);
    if (!r.ok) return redirectWithError(req, r.error);
    const res = NextResponse.redirect(new URL("/settings/channels?connected=messenger", req.url));
    res.cookies.delete("msgr_oauth_state");
    return res;
  }

  // Multiple Pages → stash the (short-lived) user token + send to the chooser.
  const res = NextResponse.redirect(new URL("/settings/channels/messenger/select", req.url));
  res.cookies.delete("msgr_oauth_state");
  res.cookies.set("msgr_oauth_token", userToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 min to pick
    path: "/",
  });
  return res;
}

function absoluteUrl(req: NextRequest, path: string): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}${path}`;
}

function redirectWithError(req: NextRequest, msg: string) {
  const dest = new URL("/settings/channels", req.url);
  dest.searchParams.set("error", msg);
  const res = NextResponse.redirect(dest);
  res.cookies.delete("msgr_oauth_state");
  return res;
}
