import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret } from "@/lib/supabase/vault";
import { assertCanAddChannel } from "@/lib/billing/gates";

export const runtime = "nodejs";

const META_GRAPH_VERSION = "v22.0";

// Completes WhatsApp Embedded Signup. The client (embedded-signup-button.tsx)
// runs Meta's FB.login Embedded Signup, which returns an auth `code` plus the
// selected `phone_number_id` + `waba_id`; we exchange the code for a business
// access token, store the channel, and subscribe the WABA to our webhook.
//
// ⚠️ DEV-MODE TEST REQUIRED: this is built to spec but not yet verified against
// a live Meta app (needs META_APP_ID/SECRET + an Embedded Signup config_id +
// the app in dev mode with you as a test user). Expect to tweak the token
// exchange / subscribe step against real Meta behavior on first run.
type Body = { code?: string; phoneNumberId?: string; wabaId?: string; name?: string };

export async function POST(req: Request) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "WhatsApp one-click isn't configured (META_APP_ID/SECRET unset)." },
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

  const gate = await assertCanAddChannel(orgId, "whatsapp");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 402 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = body.code?.trim();
  const phoneNumberId = body.phoneNumberId?.trim();
  const wabaId = body.wabaId?.trim();
  if (!code) return NextResponse.json({ error: "Missing authorization code." }, { status: 400 });
  if (!phoneNumberId || !wabaId) {
    return NextResponse.json({ error: "Missing phone_number_id / waba_id." }, { status: 400 });
  }

  // 1. Exchange the ES auth code for a business access token (token via header
  //    on subsequent calls; the code exchange itself passes app creds as query).
  const exchUrl =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&code=${encodeURIComponent(code)}`;
  const exchRes = await fetch(exchUrl, { method: "GET" });
  const exchJson = (await exchRes.json().catch(() => null)) as
    | { access_token?: string; error?: { message: string } }
    | null;
  if (!exchRes.ok || exchJson?.error || !exchJson?.access_token) {
    return NextResponse.json(
      { error: exchJson?.error?.message ?? `Token exchange failed (HTTP ${exchRes.status}).` },
      { status: 502 },
    );
  }
  const accessToken = exchJson.access_token;

  // 2. Subscribe the WABA to our app so inbound + status webhooks flow.
  //    Best-effort: log but don't fail the connect if Meta balks (operator can
  //    re-subscribe). The WA webhook HMACs against META_APP_SECRET regardless.
  try {
    await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(wabaId)}/subscribed_apps`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch {
    // non-fatal
  }

  // 3. Store the token in Vault; only the UUID lands in the channels row.
  let vaultId: string;
  try {
    vaultId = await vaultCreateSecret(
      accessToken,
      `whatsapp-es-${phoneNumberId}-${Date.now()}`,
      `WhatsApp (Embedded Signup) token for ${phoneNumberId}`,
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
    type: "whatsapp",
    name: body.name?.trim() || "WhatsApp",
    phone_number_id: phoneNumberId,
    wa_business_account_id: wabaId,
    access_token_vault_id: vaultId,
    webhook_secret: randomBytes(24).toString("hex"),
    active: true,
    metadata: { oauth: { connected_at: new Date().toISOString(), user_id: user.id } },
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
