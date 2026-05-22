import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, Plus, Sparkles } from "lucide-react";
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

const OBJECTIVE_LABEL: Record<string, string> = {
  support: "Customer Support",
  lead_generation: "Lead Generation",
  website_traffic: "Drive Website Traffic",
  sales: "Sales",
  booking: "Booking / Appointments",
  qualification: "Lead Qualification",
  custom: "Custom",
};

export default async function BotsPage() {
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

  const { data: bots } = await supabase
    .from("bots")
    .select("id, name, objective, active, created_at")
    .order("created_at", { ascending: false });

  // Pull source + assignment counts in two batched queries so the list
  // page is one round trip per stat instead of N+1.
  const ids = (bots ?? []).map((b) => b.id);
  const [{ data: srcCounts }, { data: asnCounts }] = await Promise.all([
    ids.length > 0
      ? supabase
          .from("bot_sources")
          .select("bot_id")
          .in("bot_id", ids)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as Array<{ bot_id: string }> }),
    ids.length > 0
      ? supabase
          .from("bot_assignments")
          .select("bot_id")
          .in("bot_id", ids)
          .eq("active", true)
      : Promise.resolve({ data: [] as Array<{ bot_id: string }> }),
  ]);
  const srcByBot: Record<string, number> = {};
  for (const r of srcCounts ?? []) {
    srcByBot[r.bot_id] = (srcByBot[r.bot_id] ?? 0) + 1;
  }
  const asnByBot: Record<string, number> = {};
  for (const r of asnCounts ?? []) {
    asnByBot[r.bot_id] = (asnByBot[r.bot_id] ?? 0) + 1;
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bots</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Train AI assistants on your knowledge base. Each bot can be
              assigned to one channel.
            </p>
          </div>
          <Button asChild className="xyra-gradient text-white border-0 hover:opacity-90">
            <Link href="/bots/new">
              <Plus className="mr-1.5 size-4" />
              Create bot
            </Link>
          </Button>
        </header>

        {(bots ?? []).length === 0 ? (
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle>No bots yet</CardTitle>
              <CardDescription>
                Create your first AI assistant. Pick a goal, set its
                personality, feed it knowledge, then assign it to a channel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="xyra-gradient text-white border-0 hover:opacity-90">
                <Link href="/bots/new">
                  <Sparkles className="mr-1.5 size-4" />
                  Create your first bot
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {(bots ?? []).map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bots/${b.id}`}
                  className="group block focus:outline-none"
                >
                  <Card className="border-white/10 bg-card/60 transition group-hover:border-[color:var(--xyra-glow)]/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex size-9 items-center justify-center rounded-lg xyra-gradient">
                            <Bot className="size-4 text-white" />
                          </span>
                          <div>
                            <CardTitle className="text-base">{b.name}</CardTitle>
                            <CardDescription className="mt-0.5">
                              {OBJECTIVE_LABEL[b.objective] ?? b.objective}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            b.active
                              ? "h-5 border-emerald-400/30 bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300"
                              : "h-5 border-zinc-500/30 bg-zinc-500/20 px-1.5 text-[10px] text-zinc-300"
                          }
                        >
                          {b.active ? "Active" : "Paused"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center gap-4 text-xs text-white/60">
                      <span>{srcByBot[b.id] ?? 0} sources</span>
                      <span>{asnByBot[b.id] ?? 0} channels</span>
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
