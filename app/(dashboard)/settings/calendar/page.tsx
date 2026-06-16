import { redirect } from "next/navigation";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDisconnectButton } from "./disconnect-button";

export const dynamic = "force-dynamic";

type Conn = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string | null;
  status: "active" | "revoked" | "error";
  error_message: string | null;
};

const PROVIDERS: Array<{ id: "google" | "microsoft"; name: string; env: string; startPath: string }> = [
  { id: "google", name: "Google Calendar", env: "GOOGLE_CLIENT_ID", startPath: "/api/auth/google-calendar/start" },
  { id: "microsoft", name: "Outlook / Microsoft 365", env: "MICROSOFT_CLIENT_ID", startPath: "/api/auth/microsoft-calendar/start" },
];

export default async function CalendarSettingsPage({
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
    .from("calendar_connections")
    .select("id, provider, account_email, status, error_message")
    .eq("org_id", me.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const conns = (rows as Conn[] | null) ?? [];
  const byProvider = new Map(conns.map((c) => [c.provider, c]));

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a calendar so your booking bot can check availability and schedule
            meetings automatically.
          </p>
        </header>

        {sp.connected && (
          <div className="rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">
            Calendar connected.
          </div>
        )}
        {sp.error && (
          <div className="rounded-md border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">
            Couldn&apos;t connect: {sp.error === "not_configured" ? "this calendar isn't enabled yet (operator setup pending)." : sp.error === "forbidden" ? "owners/admins only." : sp.error}
          </div>
        )}

        {PROVIDERS.map((p) => {
          const configured = Boolean(process.env[p.env]);
          const conn = byProvider.get(p.id);
          return (
            <Card key={p.id} className="border-white/10 bg-card/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarCheck className="size-4 text-[color:var(--xyra-glow)]" />
                  {p.name}
                </CardTitle>
                <CardDescription>
                  {conn
                    ? conn.status === "error"
                      ? `Reconnect needed — ${conn.error_message ?? "the connection expired."}`
                      : `Connected${conn.account_email ? ` as ${conn.account_email}` : ""}.`
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
                {!canManage ? (
                  <p className="text-xs text-white/40">Owners/admins manage calendars.</p>
                ) : conn ? (
                  <CalendarDisconnectButton connectionId={conn.id} />
                ) : configured ? (
                  <Button asChild className="xyra-gradient text-white">
                    <a href={p.startPath}>
                      <CalendarPlus className="mr-1.5 size-4" />
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
