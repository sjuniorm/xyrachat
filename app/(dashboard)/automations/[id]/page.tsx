import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Activity, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import type { Action, AutomationRow, TriggerType } from "@/lib/automations/types";
import { AutomationBuilder } from "../automation-builder";
import { FlowCanvas } from "@/components/automations/flow-canvas";
import { ActiveSwitch } from "./active-switch";
import { DeleteButton } from "./delete-button";
import { TriggerLabel } from "../trigger-label";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  const canEdit = ["owner", "admin", "supervisor"].includes(profile.role);
  const canDelete = ["owner", "admin"].includes(profile.role);

  const { data: row } = await supabase
    .from("automations")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return notFound();
  const automation = row as AutomationRow;

  const [{ data: channels }, { data: members }, { data: logs }, { data: sequences }] = await Promise.all([
    supabase
      .from("channels")
      .select("id, name, type")
      .is("deleted_at", null),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("org_id", profile.org_id)
      .is("deleted_at", null),
    supabase
      .from("automation_logs")
      .select("id, contact_id, status, error_message, steps, created_at, contacts:contacts!automation_logs_contact_id_fkey(id, name, phone, instagram_id, telegram_id)")
      .eq("automation_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("sequences")
      .select("id, name")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/automations"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to automations
        </Link>

        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{automation.name}</h1>
              <Badge
                variant="outline"
                className={
                  automation.active
                    ? "h-5 border-emerald-400/30 bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300"
                    : "h-5 border-zinc-500/30 bg-zinc-500/20 px-1.5 text-[10px] text-zinc-300"
                }
              >
                {automation.active ? "On" : "Off"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-white/60">
              <TriggerLabel trigger={automation.trigger_type as TriggerType} />
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && <ActiveSwitch id={automation.id} active={automation.active} />}
            {canDelete && <DeleteButton id={automation.id} />}
          </div>
        </header>

        {/* Counters */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatTile icon={Activity} label="Total runs" value={automation.run_count} />
          <StatTile icon={CheckCircle2} label="Successes" value={automation.success_count} tone="ok" />
          <StatTile icon={XCircle} label="Failures" value={automation.failure_count} tone={automation.failure_count > 0 ? "warn" : "neutral"} />
        </div>

        {/* Flow visualization */}
        <Card className="mb-8 border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Flow</CardTitle>
            <CardDescription>
              Visual map of this automation — triggers, branches and waits.
              Drag-and-drop editing is coming; edit the steps below for now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FlowCanvas
              triggerLabel={(() => {
                const kw = (automation.trigger_config?.keywords ?? []) as string[];
                const base = automation.trigger_type.replace(/_/g, " ");
                return kw.length ? `${base}: ${kw.join(", ")}` : base;
              })()}
              actions={(automation.actions ?? []) as Action[]}
            />
          </CardContent>
        </Card>

        {/* Recent runs */}
        <Card className="mb-8 border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Recent runs</CardTitle>
            <CardDescription>Last 20 executions.</CardDescription>
          </CardHeader>
          <CardContent>
            {(logs ?? []).length === 0 ? (
              <p className="text-sm text-white/50">No runs yet.</p>
            ) : (
              <ul className="divide-y divide-white/5 text-xs">
                {(logs ?? []).map((l) => {
                  const c = l.contacts as { name?: string | null } | null;
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-white/80">
                          {c?.name ?? "Unknown contact"}
                        </p>
                        <p className="text-[10px] text-white/40" suppressHydrationWarning>
                          {new Date(l.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          l.status === "success"
                            ? "h-5 border-emerald-400/30 bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300"
                            : l.status === "skipped"
                              ? "h-5 border-zinc-500/30 bg-zinc-500/20 px-1.5 text-[10px] text-zinc-300"
                              : "h-5 border-red-400/30 bg-red-400/15 px-1.5 text-[10px] text-red-300"
                        }
                      >
                        {l.status}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Edit */}
        {canEdit ? (
          <AutomationBuilder
            mode="edit"
            initial={{
              id: automation.id,
              name: automation.name,
              description: automation.description,
              channelId: automation.channel_id ?? "",
              triggerType: automation.trigger_type as TriggerType,
              triggerConfig: automation.trigger_config,
              actions: automation.actions as Action[],
            }}
            channels={(channels ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type }))}
            members={(members ?? []).map((m) => ({ id: m.id, name: m.full_name ?? "Agent" }))}
            sequences={sequences ?? []}
          />
        ) : (
          <p className="text-sm text-white/50">
            You don't have permission to edit this automation.
          </p>
        )}
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "ok" | "warn" | "neutral";
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-red-300"
        : "text-white";
  return (
    <Card className="border-white/10 bg-card/60">
      <CardContent className="flex items-center gap-3 py-3">
        <Icon className="size-4 text-white/60" />
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/50">{label}</p>
          <p className={`text-xl font-semibold tabular-nums ${cls}`}>{value.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}
