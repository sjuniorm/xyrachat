import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, Plus, Send, Clock, CheckCircle2, XCircle } from "lucide-react";
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
import { LaunchNowButton } from "./launch-now-button";

const STATUS_TONE: Record<
  string,
  { label: string; icon: typeof Clock; className: string }
> = {
  draft: {
    label: "Draft",
    icon: Clock,
    className: "border-zinc-500/30 bg-zinc-500/20 text-zinc-300",
  },
  scheduled: {
    label: "Scheduled",
    icon: Clock,
    className: "border-amber-400/30 bg-amber-400/15 text-amber-300",
  },
  sending: {
    label: "Sending",
    icon: Send,
    className: "border-sky-400/30 bg-sky-400/15 text-sky-300",
  },
  done: {
    label: "Sent",
    icon: CheckCircle2,
    className: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "border-red-400/30 bg-red-400/15 text-red-300",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "border-zinc-500/30 bg-zinc-500/20 text-zinc-300",
  },
};

export default async function BroadcastsPage() {
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

  const [{ data: broadcasts }, { count: approvedTplCount }, { count: waCount }] =
    await Promise.all([
      supabase
        .from("broadcasts")
        .select("id, name, status, total_count, sent_count, failed_count, scheduled_at, created_at, started_at, finished_at, last_error")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("wa_templates")
        .select("id", { count: "exact", head: true })
        .eq("meta_status", "APPROVED")
        .is("deleted_at", null),
      supabase
        .from("channels")
        .select("id", { count: "exact", head: true })
        .eq("type", "whatsapp")
        .is("deleted_at", null),
    ]);

  const blocked =
    (waCount ?? 0) === 0
      ? "Connect a WhatsApp channel first."
      : (approvedTplCount ?? 0) === 0
        ? "You need at least one Meta-approved template before sending broadcasts."
        : null;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Broadcasts</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Send WhatsApp templates to filtered audiences — useful for
              announcements, promotions, transactional updates.
            </p>
          </div>
          <Button
            asChild
            disabled={!canCreate || !!blocked}
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            <Link href={blocked || !canCreate ? "#" : "/broadcasts/new"}>
              <Plus className="mr-1.5 size-4" />
              New broadcast
            </Link>
          </Button>
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
                <Link
                  href={
                    (waCount ?? 0) === 0
                      ? "/settings/channels/new"
                      : "/templates/new"
                  }
                >
                  {(waCount ?? 0) === 0
                    ? "Connect WhatsApp"
                    : "Create template"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {(broadcasts ?? []).length === 0 ? (
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Megaphone className="size-5 text-white/60" />
                <CardTitle>No broadcasts yet</CardTitle>
              </div>
              <CardDescription>
                Create a broadcast to send a WhatsApp template to many contacts
                at once.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-2">
            {(broadcasts ?? []).map((b) => {
              const tone =
                STATUS_TONE[b.status] ?? STATUS_TONE.draft;
              const Icon = tone.icon;
              const progress =
                b.total_count > 0
                  ? Math.round(((b.sent_count + b.failed_count) / b.total_count) * 100)
                  : 0;
              return (
                <li key={b.id}>
                  <Card className="border-white/10 bg-card/60">
                    <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-white">
                            {b.name}
                          </p>
                          <Badge
                            variant="outline"
                            className={`h-5 px-1.5 text-[10px] ${tone.className}`}
                          >
                            <Icon className="mr-0.5 size-2.5" />
                            {tone.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-white/50">
                          {b.status === "scheduled" && b.scheduled_at
                            ? `Scheduled for ${new Date(b.scheduled_at).toLocaleString()}`
                            : b.status === "sending" || b.status === "done"
                              ? `${b.sent_count} sent · ${b.failed_count} failed / ${b.total_count} total (${progress}%)`
                              : `${b.total_count} recipients`}
                        </p>
                        {b.last_error && (
                          <p className="mt-0.5 truncate text-[11px] text-red-300">
                            {b.last_error}
                          </p>
                        )}
                      </div>
                      {b.status === "draft" && canCreate && (
                        <LaunchNowButton broadcastId={b.id} />
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
