import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Plus, RefreshCw, AlertCircle } from "lucide-react";
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
import type { TemplateMetaStatus, WaTemplateRow } from "@/lib/templates/types";
import { SyncTemplatesButton } from "./sync-button";

const STATUS_TONE: Record<
  TemplateMetaStatus,
  { label: string; className: string }
> = {
  APPROVED: {
    label: "Approved",
    className: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300",
  },
  PENDING: {
    label: "Pending review",
    className: "border-amber-400/30 bg-amber-400/15 text-amber-300",
  },
  REJECTED: {
    label: "Rejected",
    className: "border-red-400/30 bg-red-400/15 text-red-300",
  },
  DISABLED: {
    label: "Disabled",
    className: "border-zinc-500/30 bg-zinc-500/20 text-zinc-300",
  },
  PAUSED: {
    label: "Paused",
    className: "border-zinc-500/30 bg-zinc-500/20 text-zinc-300",
  },
  IN_APPEAL: {
    label: "In appeal",
    className: "border-amber-400/30 bg-amber-400/15 text-amber-300",
  },
  LIMIT_EXCEEDED: {
    label: "Limit exceeded",
    className: "border-red-400/30 bg-red-400/15 text-red-300",
  },
};

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
};

export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  // Templates + WA channel count (the New button is disabled when no WA
  // channels exist — without them there's no Meta business account to
  // submit against).
  const [{ data: templates }, { count: waCount }] = await Promise.all([
    supabase
      .from("wa_templates")
      .select("id, name, language, category, meta_status, meta_rejection_reason, components, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("type", "whatsapp")
      .is("deleted_at", null),
  ]);

  const rows = (templates ?? []) as Pick<
    WaTemplateRow,
    "id" | "name" | "language" | "category" | "meta_status" | "meta_rejection_reason" | "components" | "created_at"
  >[];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">WhatsApp templates</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pre-approved messages required to start conversations outside the
              24-hour customer-service window.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SyncTemplatesButton />
            <Button
              asChild
              disabled={(waCount ?? 0) === 0}
              className="xyra-gradient text-white border-0 hover:opacity-90"
            >
              <Link href={(waCount ?? 0) === 0 ? "#" : "/templates/new"}>
                <Plus className="mr-1.5 size-4" />
                New template
              </Link>
            </Button>
          </div>
        </header>

        {(waCount ?? 0) === 0 ? (
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle>Connect a WhatsApp channel first</CardTitle>
              <CardDescription>
                Templates are submitted against a WhatsApp Business Account —
                you need at least one WA channel before you can create one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="xyra-gradient text-white border-0 hover:opacity-90">
                <Link href="/settings/channels/new">Connect WhatsApp</Link>
              </Button>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-white/60" />
                <CardTitle>No templates yet</CardTitle>
              </div>
              <CardDescription>
                Create your first template — once Meta approves it, you can use
                it in broadcasts and to initiate conversations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="xyra-gradient text-white border-0 hover:opacity-90">
                <Link href="/templates/new">
                  <Plus className="mr-1.5 size-4" />
                  Create your first template
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((t) => {
              const tone = STATUS_TONE[t.meta_status];
              const body = (t.components as Array<{ type: string; text?: string }>).find(
                (c) => c.type === "BODY",
              );
              return (
                <li key={t.id}>
                  <Card className="border-white/10 bg-card/60">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base font-mono">
                            {t.name}
                          </CardTitle>
                          <CardDescription className="mt-0.5 flex items-center gap-1.5">
                            <span>{CATEGORY_LABEL[t.category] ?? t.category}</span>
                            <span className="text-white/30">•</span>
                            <span>{t.language}</span>
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className={`h-5 px-1.5 text-[10px] ${tone.className}`}
                        >
                          {tone.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-1">
                      <p className="line-clamp-3 text-xs text-white/70 whitespace-pre-wrap">
                        {body?.text ?? "(no body)"}
                      </p>
                      {t.meta_status === "REJECTED" && t.meta_rejection_reason && (
                        <div className="flex items-start gap-1.5 rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1.5 text-[11px] text-red-300">
                          <AlertCircle className="mt-px size-3 shrink-0" />
                          <span>{t.meta_rejection_reason}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 flex items-center gap-1.5 text-xs text-white/40">
          <RefreshCw className="size-3" />
          Click <span className="text-white/60">Sync from Meta</span> after
          submitting to refresh approval status.
        </p>
      </div>
    </div>
  );
}
