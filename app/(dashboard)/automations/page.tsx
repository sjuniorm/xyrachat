import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, Plus, Power, Activity, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { TriggerLabel } from "./trigger-label";

export default async function AutomationsPage() {
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
  const canCreate = ["owner", "admin", "supervisor"].includes(profile.role);

  const [{ data: automations }, { count: channelCount }] = await Promise.all([
    supabase
      .from("automations")
      .select("id, name, description, trigger_type, active, run_count, success_count, failure_count, last_triggered_at, channel_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);

  const blocked = (channelCount ?? 0) === 0
    ? "Connect a channel first — automations fire on incoming messages."
    : null;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Trigger-based workflows. Comment keywords, story mentions, DM
              keywords on Instagram; keyword auto-replies on WhatsApp.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="border-white/10">
              <Link href="/automations/sequences">
                <Clock className="mr-1.5 size-4" />
                Sequences
              </Link>
            </Button>
            <Button
              asChild
              disabled={!canCreate || !!blocked}
              className="xyra-gradient text-white border-0 hover:opacity-90"
            >
              <Link href={!canCreate || blocked ? "#" : "/automations/new"}>
                <Plus className="mr-1.5 size-4" />
                New automation
              </Link>
            </Button>
          </div>
        </header>

        {blocked && (
          <Card className="mb-4 border-amber-400/30 bg-amber-400/5">
            <CardHeader>
              <CardTitle className="text-base text-amber-200">
                Setup needed
              </CardTitle>
              <CardDescription className="text-amber-100/70">
                {blocked}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                variant="outline"
                className="border-amber-400/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20"
              >
                <Link href="/settings/channels/new">Connect a channel</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {(automations ?? []).length === 0 ? (
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-white/60" />
                <CardTitle>No automations yet</CardTitle>
              </div>
              <CardDescription>
                Build your first trigger — e.g. auto-reply when someone DMs the
                word &quot;price&quot; on Instagram.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {(automations ?? []).map((a) => (
              <li key={a.id}>
                <Link href={`/automations/${a.id}`} className="group block focus:outline-none">
                  <Card className="border-white/10 bg-card/60 transition group-hover:border-[color:var(--xyra-glow)]/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-base">{a.name}</CardTitle>
                          <CardDescription className="mt-0.5">
                            <TriggerLabel trigger={a.trigger_type} />
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            a.active
                              ? "h-5 gap-1 border-emerald-400/30 bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300"
                              : "h-5 gap-1 border-zinc-500/30 bg-zinc-500/20 px-1.5 text-[10px] text-zinc-300"
                          }
                        >
                          <Power className="size-2.5" />
                          {a.active ? "On" : "Off"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center gap-3 text-xs text-white/60">
                      <span className="inline-flex items-center gap-1">
                        <Activity className="size-3" />
                        {a.run_count} runs
                      </span>
                      <span className="text-white/40">·</span>
                      <span>{a.success_count} ok</span>
                      {a.failure_count > 0 && (
                        <>
                          <span className="text-white/40">·</span>
                          <span className="text-red-300/80">
                            {a.failure_count} failed
                          </span>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
