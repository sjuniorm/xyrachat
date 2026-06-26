import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret } from "@/lib/supabase/vault";
import { assertCanAddChannel } from "@/lib/billing/gates";

export const runtime = "nodejs";

const META_GRAPH_VERSION = "v22.0";
const SUBSCRIBED_FIELDS = "messages,messaging_postbacks,message_deliveries,message_reads";

// One-click Messenger connect via Facebook Login for Business. The client runs
// FB.login (Messenger config) → returns an auth `code`; we exchange it for a
// user token, list the user's Pages, connect the first one (page token → Vault,
// subscribe to our webhook, create the channel).
//
// ⚠️ DEV-MODE TEST REQUIRED: built to spec, not yet verified against a live Meta
// app. When the account has multiple Pages we return the list so the user picks
// (no auto-pick); the client re-runs FB.login and posts back the chosen pageId.
type Body = { code?: string; name?: string; pageId?: string };

export async function POST(req: Request) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "Messenger one-click isn't configured (META_APP_ID/SECRET unset)." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id;
  if (!orgId) return NextResponse.json({ error: "No organization." }, { status: 403 });

  const gate = await assertCanAddChannel(orgId, "facebook");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 402 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = body.code?.trim();
  if (!code) return NextResponse.json({ error: "Missing authorization code." }, { status: 400 });

  // 1. Exchange code → user access token. Creds in the POST body (not the URL)
  //    so client_secret + code stay out of request-URL logs.
  const exchRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      // The code comes from FB.login (JS SDK popup), which uses NO redirect_uri.
      // Meta's token exchange still requires the param and demands it MATCH the
      // dialog — so it must be sent as an empty string. Omitting it triggers
      // "Error validating verification code … redirect_uri identical".
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: "",
        code,
      }).toString(),
    },
  );
  const exchJson = (await exchRes.json().catch(() => null)) as
    | { access_token?: string; error?: { message: string } }
    | null;
  if (!exchRes.ok || exchJson?.error || !exchJson?.access_token) {
    return NextResponse.json(
      { error: exchJson?.error?.message ?? `Token exchange failed (HTTP ${exchRes.status}).` },
      { status: 502 },
    );
  }
  const userToken = exchJson.access_token;

  // 2. List the user's Pages (includes per-page access tokens).
  const pagesRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?fields=id,name,access_token`,
    { headers: { Authorization: `Bearer ${userToken}` } },
  );
  const pagesJson = (await pagesRes.json().catch(() => null)) as
    | { data?: Array<{ id: string; name: string; access_token: string }>; error?: { message: string } }
    | null;
  if (!pagesRes.ok || pagesJson?.error) {
    return NextResponse.json(
      { error: pagesJson?.error?.message ?? "Couldn't list your Facebook Pages." },
      { status: 502 },
    );
  }
  const pages = pagesJson?.data ?? [];
  if (pages.length === 0) {
    return NextResponse.json(
      { error: "No Facebook Pages found on this account." },
      { status: 422 },
    );
  }
  // Page selection: honor an explicit choice; auto-use the only Page; otherwise
  // return the list so the user picks (don't silently connect the wrong Page).
  let page: { id: string; name: string; access_token: string } | undefined;
  if (body.pageId) {
    page = pages.find((p) => p.id === body.pageId);
    if (!page) {
      return NextResponse.json(
        { error: "That Page wasn't found on your account." },
        { status: 422 },
      );
    }
  } else if (pages.length === 1) {
    page = pages[0];
  } else {
    // No tokens in this response — just id + name for the chooser.
    return NextResponse.json({
      ok: false,
      needsChoice: true,
      pages: pages.map((p) => ({ id: p.id, name: p.name })),
    });
  }

  // 3. Subscribe the Page to our app's webhook (also validates the page token).
  const subRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${page.id}/subscribed_apps?subscribed_fields=${SUBSCRIBED_FIELDS}`,
    { method: "POST", headers: { Authorization: `Bearer ${page.access_token}` } },
  );
  if (!subRes.ok) {
    const j = (await subRes.json().catch(() => null)) as { error?: { message: string } } | null;
    return NextResponse.json(
      { error: j?.error?.message ?? `Couldn't subscribe the Page (HTTP ${subRes.status}).` },
      { status: 502 },
    );
  }

  // 4. Store the Page token; create the channel.
  let vaultId: string;
  try {
    vaultId = await vaultCreateSecret(
      page.access_token,
      `messenger-oauth-${page.id}-${Date.now()}`,
      `Facebook Page token for ${page.name}`,
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Vault: ${err.message}` : "Vault store failed." },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const { error: insErr } = await admin.from("channels").insert({
    org_id: orgId,
    type: "facebook",
    name: body.name?.trim() || page.name,
    page_id: page.id,
    access_token_vault_id: vaultId,
    active: true,
    metadata: { page_name: page.name, oauth: { connected_at: new Date().toISOString(), user_id: user.id } },
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, pageName: page.name });
}
