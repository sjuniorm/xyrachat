import { redirect } from "next/navigation";
import { Database, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CrmDisconnectButton } from "./disconnect-button";
import { CrmFlash } from "./flash";

export const dynamic = "force-dynamic";

type Conn = {
  id: string;
  provider: "hubspot" | "pipedrive" | "salesforce";
  account_label: string | null;
  status: "active" | "revoked" | "error";
  error_message: string | null;
};

// All three are wired. Each only shows "Connect" once the operator sets its
// OAuth env vars (configured = live && env present); otherwise "not available".
const PROVIDERS: Array<{ id: Conn["provider"]; name: string; env: string; startPath: string; live: boolean }> = [
  { id: "hubspot", name: "HubSpot", env: "HUBSPOT_CLIENT_ID", startPath: "/api/auth/hubspot/start", live: true },
  { id: "pipedrive", name: "Pipedrive", env: "PIPEDRIVE_CLIENT_ID", startPath: "/api/auth/pipedrive/start", live: true },
  { id: "salesforce", name: "Salesforce", env: "SALESFORCE_CLIENT_ID", startPath: "/api/auth/salesforce/start", live: true },
];

export default async function CrmSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me?.org_id) redirect("/onboarding");
  const canManage = me.role === "owner" || me.role === "admin";

  const { data: rows } = await supabase
    .from("crm_connections")
    .select("id, provider, account_label, status, error_message")
    .eq("org_id", me.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const byProvider = new Map(((rows as Conn[] | null) ?? []).map((c) => [c.provider, c]));

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your CRM so leads captured in chat sync automatically — no manual
            copying.
          </p>
        </header>

        <CrmFlash connected={sp.connected} error={sp.error} />

        {PROVIDERS.map((p) => {
          const configured = p.live && Boolean(process.env[p.env]);
          const conn = byProvider.get(p.id);
          return (
            <Card key={p.id} className="border-white/10 bg-card/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="size-4 text-[color:var(--xyra-glow)]" />
                  {p.name}
                </CardTitle>
                <CardDescription>
                  {!p.live
                    ? "Coming soon."
                    : conn
                      ? conn.status === "error"
                        ? `Reconnect needed — ${conn.error_message ?? "the connection expired."}`
                        : `Connected${conn.account_label ? ` · ${conn.account_label}` : ""}. New leads sync automatically.`
                      : configured
                        ? "Not connected."
                        : "Not available yet — operator needs to configure this provider."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                {conn && conn.status !== "error" && (
                  <Badge variant="outline" className="h-6 border-emerald-400/30 bg-emerald-400/15 px-2 text-xs text-emerald-300">
                    Active
                  </Badge>
                )}
                {!p.live ? (
                  <Button disabled className="opacity-40">Coming soon</Button>
                ) : !canManage ? (
                  <p className="text-xs text-white/40">Owners/admins manage integrations.</p>
                ) : conn ? (
                  <CrmDisconnectButton connectionId={conn.id} />
                ) : configured ? (
                  <Button asChild className="xyra-gradient text-white">
                    <a href={p.startPath}>
                      <Plus className="mr-1.5 size-4" />
                      Connect {p.name}
                    </a>
                  </Button>
                ) : (
                  <Button disabled className="opacity-40">Coming soon</Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
