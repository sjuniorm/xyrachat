import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/server";
import { OverviewTab } from "./overview-tab";
import { KnowledgeTab } from "./knowledge-tab";
import { SettingsTab } from "./settings-tab";
import { TestTab } from "./test-tab";
import { AssignTab } from "./assign-tab";

export default async function BotDetailPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: bot } = await supabase
    .from("bots")
    .select("*")
    .eq("id", botId)
    .maybeSingle();
  if (!bot) notFound();

  const [
    { data: sources },
    { data: assignments },
    { data: channels },
    { data: outcomeRows },
    { data: feedbackRows },
    { data: visitorFeedbackRows },
  ] = await Promise.all([
    supabase
      .from("bot_sources")
      .select("*")
      .eq("bot_id", botId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("bot_assignments")
      .select("channel_id, active, routing_description, business_hours")
      .eq("bot_id", botId),
    supabase
      .from("channels")
      .select("id, type, name")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("bot_outcomes")
      .select("type, created_at")
      .eq("bot_id", botId)
      .order("created_at", { ascending: false })
      .limit(500),
    // Agent 👍/👎 on this bot's replies (RLS scopes to the org).
    supabase
      .from("bot_reply_feedback")
      .select("rating")
      .eq("bot_id", botId)
      .is("deleted_at", null)
      .limit(2000),
    // End-CUSTOMER 👍/👎 from the webchat widget.
    supabase
      .from("bot_reply_visitor_feedback")
      .select("rating")
      .eq("bot_id", botId)
      .limit(2000),
  ]);

  const tally = (rows: unknown) =>
    ((rows ?? []) as Array<{ rating: "up" | "down" }>).reduce(
      (acc, r) => {
        if (r.rating === "up") acc.up += 1;
        else if (r.rating === "down") acc.down += 1;
        return acc;
      },
      { up: 0, down: 0 },
    );
  const feedback = tally(feedbackRows);
  const customerFeedback = tally(visitorFeedbackRows);

  // Hallucination guardrail: a live, channel-assigned bot with zero successfully
  // embedded knowledge will answer from the model's general training, not the
  // operator's content — exactly the "confidently wrong about your prices/policy"
  // risk. Warn loudly so it's never shipped silently.
  const hasKnowledge = (sources ?? []).some((s) => s.embedding_status === "done");
  const activeAssignmentCount = (assignments ?? []).filter((a) => a.active).length;
  const liveButUngrounded = bot.active && activeAssignmentCount > 0 && !hasKnowledge;
  const sourcesStillProcessing = (sources ?? []).some(
    (s) => s.embedding_status === "pending" || s.embedding_status === "running",
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/bots"
          className="mb-4 inline-flex items-center gap-1 text-xs text-white/60 hover:text-white"
        >
          <ChevronLeft className="size-3.5" />
          All bots
        </Link>
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{bot.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {bot.objective.replaceAll("_", " ")} · {bot.language} ·
              {" "}threshold {Number(bot.knowledge_threshold).toFixed(2)}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              bot.active
                ? "h-6 border-emerald-400/30 bg-emerald-400/15 px-2 text-xs text-emerald-300"
                : "h-6 border-zinc-500/30 bg-zinc-500/20 px-2 text-xs text-zinc-300"
            }
          >
            {bot.active ? "Active" : "Paused"}
          </Badge>
        </header>

        {liveButUngrounded && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">This bot is live but has no knowledge yet.</p>
              <p className="mt-0.5 text-amber-200/80">
                {sourcesStillProcessing
                  ? "Its sources are still being processed. Until at least one finishes, it answers from general AI — not your content — so it may state prices, policies, or facts that aren't yours."
                  : "It will answer from general AI, not your content, so it can confidently invent prices, policies, or facts. Add a knowledge source in the Knowledge tab below to keep answers accurate."}
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-5 bg-white/5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
            <TabsTrigger value="assign">Assign</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab
              bot={bot}
              sourceCount={(sources ?? []).length}
              activeChannelCount={
                (assignments ?? []).filter((a) => a.active).length
              }
              outcomes={(outcomeRows ?? []) as Array<{ type: string; created_at: string }>}
              feedback={feedback}
              customerFeedback={customerFeedback}
            />
          </TabsContent>
          <TabsContent value="knowledge" className="mt-6">
            <KnowledgeTab
              botId={bot.id}
              sources={(sources ?? []) as KnowledgeSource[]}
            />
          </TabsContent>
          <TabsContent value="test" className="mt-6">
            <TestTab botId={bot.id} botName={bot.name} threshold={bot.knowledge_threshold} />
          </TabsContent>
          <TabsContent value="assign" className="mt-6">
            <AssignTab
              // Key by the fetched assignment state so the tab remounts and
              // re-seeds its local toggle/routing state after router.refresh()
              // (the lazy useState initializers only run on mount).
              key={(assignments ?? [])
                .map(
                  (a) =>
                    `${a.channel_id}:${a.active ? 1 : 0}:${a.routing_description ?? ""}:${a.business_hours ? "s" : "_"}`,
                )
                .sort()
                .join("|")}
              botId={bot.id}
              channels={(channels ?? []) as Channel[]}
              assignments={
                (assignments ?? []) as Array<{
                  channel_id: string;
                  active: boolean;
                  routing_description: string | null;
                  business_hours: unknown | null;
                }>
              }
            />
          </TabsContent>
          <TabsContent value="settings" className="mt-6">
            {/* Re-seed the form after a save (router.refresh) so the business-hours
                editor reflects the persisted/sanitized value, not pre-save local state. */}
            <SettingsTab key={JSON.stringify(bot.business_hours ?? {})} bot={bot} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export type KnowledgeSource = {
  id: string;
  type: "document" | "url" | "text";
  title: string | null;
  url: string | null;
  embedding_status: "pending" | "running" | "done" | "failed";
  embedding_error: string | null;
  created_at: string;
};
export type Channel = { id: string; type: string; name: string };
