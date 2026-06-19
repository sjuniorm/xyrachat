import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApiKeysCard } from "./api-keys-card";
import { WebhookEndpointsCard } from "./webhook-endpoints-card";

export default async function ApiSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const isAdmin = profile.role === "owner" || profile.role === "admin";

  const [{ data: keys }, { data: endpoints }] = await Promise.all([
    supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, expires_at, revoked_at, last_used_at, last_used_ip, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("webhook_endpoints")
      .select("id, name, url, events, active, source, consecutive_failures, last_success_at, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">API & Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Programmatic access to your inbox + outbound events for Make /
            Zapier / n8n integrations.
          </p>
        </header>

        <ApiKeysCard keys={keys ?? []} isAdmin={isAdmin} />
        <WebhookEndpointsCard endpoints={endpoints ?? []} isAdmin={isAdmin} />

        <div className="rounded-lg border border-white/10 bg-card/40 p-4 text-xs text-white/60">
          <p className="font-medium text-white">Base URL</p>
          <code className="mt-1 block rounded bg-black/30 px-2 py-1.5 font-mono text-[11px] text-white/90">
            https://app.xyrachat.com/api/v1
          </code>
          <p className="mt-3 font-medium text-white">Auth</p>
          <code className="mt-1 block rounded bg-black/30 px-2 py-1.5 font-mono text-[11px] text-white/90">
            Authorization: Bearer xyra_live_...
          </code>
          <p className="mt-3 font-medium text-white">Quick test</p>
          <code className="mt-1 block rounded bg-black/30 px-2 py-1.5 font-mono text-[11px] text-white/90">
            curl -H "Authorization: Bearer $KEY" https://app.xyrachat.com/api/v1/me
          </code>
        </div>
      </div>
    </div>
  );
}
