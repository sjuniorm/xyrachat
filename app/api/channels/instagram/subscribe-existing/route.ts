import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { subscribeIgWebhooks } from "@/lib/instagram/subscribe";

export const runtime = "nodejs";

// One-shot endpoint: for every Instagram channel in the current user's org,
// (re-)subscribe the IG account to webhooks. Useful when a channel was
// connected before we wired the auto-subscribe step into the OAuth callback,
// or any time webhooks need to be re-linked.
//
// Returns JSON so you can hit it from a browser address bar and read the
// result without leaving the tab.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No org" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: channels } = await admin
    .from("channels")
    .select("id, name, ig_business_account_id, access_token_vault_id")
    .eq("org_id", profile.org_id)
    .eq("type", "instagram")
    .is("deleted_at", null);

  const list = channels ?? [];
  if (list.length === 0) {
    return NextResponse.json({ ok: true, results: [], note: "no instagram channels" });
  }

  const results: Array<{
    channel_id: string;
    name: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const c of list) {
    if (!c.ig_business_account_id || !c.access_token_vault_id) {
      results.push({
        channel_id: c.id,
        name: c.name,
        ok: false,
        error: "missing ig_business_account_id or token",
      });
      continue;
    }
    const token = await vaultReadSecret(c.access_token_vault_id).catch(() => null);
    if (!token) {
      results.push({
        channel_id: c.id,
        name: c.name,
        ok: false,
        error: "could not read token from Vault",
      });
      continue;
    }
    const ok = await subscribeIgWebhooks(c.ig_business_account_id, token);
    results.push({ channel_id: c.id, name: c.name, ok });
  }

  return NextResponse.json({ ok: true, results });
}
