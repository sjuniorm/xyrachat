import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret } from "@/lib/supabase/vault";

export const runtime = "nodejs";

const META_GRAPH_VERSION = "v22.0";

// Receives ?code=...&state=... after the user authorizes on Facebook. We:
//   1. Verify the state cookie matches (CSRF)
//   2. Exchange code for a short-lived user token
//   3. Upgrade to a long-lived (60-day) user token
//   4. List the user's Pages — pick the one with a linked Instagram Business
//      account
//   5. Store the long-lived PAGE access token in Vault, create the channel
//
// On success: redirect to /settings/channels with a success flash. On failure:
// redirect to a friendly error page so the user knows what went wrong without
// exposing internals.
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

  if (error) {
    return redirectWithError(req, `Meta denied the request: ${error}`);
  }
  if (!code || !state) {
    return redirectWithError(req, "Missing code or state from Meta.");
  }

  // CSRF: state must match the cookie we set when starting the flow.
  const expectedState = req.cookies.get("ig_oauth_state")?.value;
  if (!expectedState || expectedState !== state) {
    return redirectWithError(req, "OAuth state mismatch — please retry.");
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return redirectWithError(req, "Meta OAuth is not configured.");
  }

  const redirectUri = absoluteUrl(req, "/api/auth/instagram/callback");

  // 1. Code → short-lived user token.
  const shortToken = await exchangeCode(appId, appSecret, code, redirectUri);
  if (!shortToken) {
    return redirectWithError(req, "Couldn't exchange code for an access token.");
  }

  // 2. Short-lived → long-lived user token (~60 days).
  const longToken = await upgradeToLongLivedUserToken(appId, appSecret, shortToken);
  if (!longToken) {
    return redirectWithError(req, "Couldn't upgrade to a long-lived token.");
  }

  // 3. List Pages, find one with an instagram_business_account linked.
  const pages = await listPagesWithIg(longToken);
  if (!pages.length) {
    return redirectWithError(
      req,
      "No Instagram-linked Facebook Page found on this account.",
    );
  }
  // Auto-pick the first match for MVP. A chooser screen will land later
  // when an account has multiple IG-linked pages.
  const page = pages[0];

  // 4. Look up the user's org.
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id;
  if (!orgId) {
    return redirectWithError(req, "You must belong to an organization.");
  }

  // 5. Fetch the IG account profile for nice display (username + avatar).
  const igProfile = await fetchIgProfile(page.access_token, page.instagram_business_account.id);

  // 6. Store the page access token in Vault.
  let vaultId: string;
  try {
    vaultId = await vaultCreateSecret(
      page.access_token,
      `instagram-${page.id}-${Date.now()}`,
      `Instagram page token for ${igProfile?.username ?? page.name}`,
    );
  } catch (err) {
    return redirectWithError(
      req,
      err instanceof Error
        ? `Vault not available: ${err.message}`
        : "Couldn't store token in Vault.",
    );
  }

  // 7. Insert the channel.
  const admin = createAdminClient();
  const { error: insertErr } = await admin.from("channels").insert({
    org_id: orgId,
    type: "instagram",
    name: igProfile?.username
      ? `@${igProfile.username}`
      : page.name,
    page_id: page.id,
    ig_business_account_id: page.instagram_business_account.id,
    access_token_vault_id: vaultId,
    active: true,
    metadata: {
      ig_username: igProfile?.username,
      ig_profile_pic_url: igProfile?.profile_picture_url,
      oauth: {
        connected_at: new Date().toISOString(),
        user_id: user.id,
      },
    },
  });
  if (insertErr) {
    return redirectWithError(req, `Could not save channel: ${insertErr.message}`);
  }

  const res = NextResponse.redirect(new URL("/settings/channels?connected=instagram", req.url));
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
): Promise<string | null> {
  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code", code);
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

async function upgradeToLongLivedUserToken(
  appId: string,
  appSecret: string,
  shortToken: string,
): Promise<string | null> {
  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("fb_exchange_token", shortToken);
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

type IgLinkedPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account: { id: string };
};

async function listPagesWithIg(userToken: string): Promise<IgLinkedPage[]> {
  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts`);
  u.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account",
  );
  u.searchParams.set("access_token", userToken);
  const res = await fetch(u.toString());
  if (!res.ok) return [];
  const j = (await res.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string };
    }>;
  };
  return (j.data ?? [])
    .filter(
      (p): p is IgLinkedPage =>
        Boolean(p.instagram_business_account?.id) && Boolean(p.access_token),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      access_token: p.access_token,
      instagram_business_account: { id: p.instagram_business_account!.id },
    }));
}

async function fetchIgProfile(
  pageAccessToken: string,
  igAccountId: string,
): Promise<{ username?: string; profile_picture_url?: string } | null> {
  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${igAccountId}`);
  u.searchParams.set("fields", "username,profile_picture_url");
  u.searchParams.set("access_token", pageAccessToken);
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  return (await res.json()) as { username?: string; profile_picture_url?: string };
}
