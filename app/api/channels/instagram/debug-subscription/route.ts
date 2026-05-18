import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";

export const runtime = "nodejs";

const IG_GRAPH_VERSION = "v22.0";

// Diagnostic: asks Meta what apps are subscribed to webhook fields for each
// of this org's Instagram channels. Meta is the source of truth — if our
// app isn't in the response, the per-account subscription never took even
// though our POST returned success.
//
// Return shape:
//   results: [{ channel, ig_id, http, meta }]
// where `meta.data` is Meta's list of subscribed apps. Empty array means
// nothing is subscribed for that IG account.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 });

  const admin = createAdminClient();
  const { data: channels } = await admin
    .from("channels")
    .select("id, name, ig_business_account_id, access_token_vault_id")
    .eq("org_id", profile.org_id)
    .eq("type", "instagram")
    .is("deleted_at", null);

  const results: Array<Record<string, unknown>> = [];
  for (const c of channels ?? []) {
    if (!c.ig_business_account_id || !c.access_token_vault_id) {
      results.push({ channel: c.name, error: "missing ig_id or token" });
      continue;
    }
    const token = await vaultReadSecret(c.access_token_vault_id).catch(() => null);
    if (!token) {
      results.push({ channel: c.name, error: "could not read token from Vault" });
      continue;
    }
    const u = new URL(
      `https://graph.instagram.com/${IG_GRAPH_VERSION}/${c.ig_business_account_id}/subscribed_apps`,
    );
    u.searchParams.set("access_token", token);
    const res = await fetch(u.toString());
    const j = await res.json().catch(() => null);
    results.push({
      channel: c.name,
      ig_id: c.ig_business_account_id,
      http: res.status,
      meta: j,
    });
  }
  return NextResponse.json({ results });
}
