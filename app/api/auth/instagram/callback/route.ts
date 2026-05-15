import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret } from "@/lib/supabase/vault";

export const runtime = "nodejs";

const IG_GRAPH_VERSION = "v22.0";

// Instagram Business Login callback. The user authorizes on instagram.com,
// Meta redirects back here with ?code=...&state=.... We:
//   1. Verify the state cookie (CSRF)
//   2. Exchange the code at api.instagram.com for a SHORT-LIVED IG user
//      access token (lifespan: 1 hour)
//   3. Upgrade to a LONG-LIVED token (~60 days) via graph.instagram.com
//   4. Read /me on graph.instagram.com for username + profile_picture_url
//   5. Stash the long-lived token in Vault, create a type='instagram'
//      channel with ig_business_account_id = the IG user id, page_id = NULL
//
// On success: redirect /settings/channels?connected=instagram. On failure:
// surface a friendly message via the flash component without leaking
// internals.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorReason = url.searchParams.get("error_reason");

  if (error) {
    return redirectWithError(
      req,
      `Instagram denied the request: ${errorReason ?? error}`,
    );
  }
  if (!code || !state) {
    return redirectWithError(req, "Missing code or state from Instagram.");
  }

  const expectedState = req.cookies.get("ig_oauth_state")?.value;
  if (!expectedState || expectedState !== state) {
    return redirectWithError(req, "OAuth state mismatch — please retry.");
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    return redirectWithError(req, "Instagram OAuth is not configured.");
  }

  const redirectUri = absoluteUrl(req, "/api/auth/instagram/callback");

  // 1. Code -> short-lived IG user access token.
  const short = await exchangeCode(appId, appSecret, code, redirectUri);
  if (!short) {
    return redirectWithError(req, "Couldn't exchange code for a token.");
  }

  // 2. Short-lived -> long-lived (~60 days).
  const longToken = await upgradeToLongLived(appSecret, short.access_token);
  if (!longToken) {
    return redirectWithError(req, "Couldn't upgrade to a long-lived token.");
  }

  // 3. Fetch the IG user profile for username + avatar.
  const profile = await fetchIgProfile(longToken);
  const igUserId = profile?.id ?? String(short.user_id);

  // 4. User must belong to an org.
  const { data: dbProfile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = dbProfile?.org_id;
  if (!orgId) {
    return redirectWithError(req, "You must belong to an organization.");
  }

  // 5. Stash the long-lived token in Vault.
  let vaultId: string;
  try {
    vaultId = await vaultCreateSecret(
      longToken,
      `instagram-${igUserId}-${Date.now()}`,
      `Instagram user access token for ${profile?.username ?? igUserId}`,
    );
  } catch (err) {
    return redirectWithError(
      req,
      err instanceof Error
        ? `Vault not available: ${err.message}`
        : "Couldn't store token in Vault.",
    );
  }

  // 6. Insert the channel. page_id stays NULL for IG-direct connections —
  //    we send via graph.instagram.com/{ig_user_id}/messages instead of
  //    going through a Facebook Page.
  const admin = createAdminClient();
  const { error: insertErr } = await admin.from("channels").insert({
    org_id: orgId,
    type: "instagram",
    name: profile?.username ? `@${profile.username}` : `IG ${igUserId}`,
    page_id: null,
    ig_business_account_id: igUserId,
    access_token_vault_id: vaultId,
    active: true,
    metadata: {
      ig_username: profile?.username,
      ig_profile_pic_url: profile?.profile_picture_url,
      oauth: {
        connected_at: new Date().toISOString(),
        user_id: user.id,
      },
    },
  });
  if (insertErr) {
    return redirectWithError(req, `Could not save channel: ${insertErr.message}`);
  }

  const res = NextResponse.redirect(
    new URL("/settings/channels?connected=instagram", req.url),
  );
  res.cookies.delete("ig_oauth_state");
  return res;
}

// =====================================================================
// Helpers
// =====================================================================
function absoluteUrl(req: NextRequest, path: string): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}${path}`;
}

function redirectWithError(req: NextRequest, msg: string) {
  const dest = new URL("/settings/channels", req.url);
  dest.searchParams.set("error", msg);
  return NextResponse.redirect(dest);
}

async function exchangeCode(
  appId: string,
  appSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; user_id: number | string } | null> {
  // POST form-encoded — api.instagram.com rejects JSON for this endpoint.
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; user_id?: number | string };
  if (!j.access_token) return null;
  return { access_token: j.access_token, user_id: j.user_id ?? "" };
}

async function upgradeToLongLived(
  appSecret: string,
  shortToken: string,
): Promise<string | null> {
  const u = new URL("https://graph.instagram.com/access_token");
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("access_token", shortToken);
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

async function fetchIgProfile(token: string): Promise<{
  id: string;
  username?: string;
  profile_picture_url?: string;
} | null> {
  const u = new URL(`https://graph.instagram.com/${IG_GRAPH_VERSION}/me`);
  u.searchParams.set("fields", "id,username,profile_picture_url");
  u.searchParams.set("access_token", token);
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  return (await res.json()) as {
    id: string;
    username?: string;
    profile_picture_url?: string;
  };
}
