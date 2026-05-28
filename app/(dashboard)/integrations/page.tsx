import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Code2, Sparkles, Plug, Workflow, FileCode, Globe } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

// Connector deep links — submitted once and frozen here. The README in
// each integrations/<platform>/ folder explains how to publish the
// matching app/connector to the respective platform.
const CONNECTORS = [
  {
    id: "make",
    name: "Make.com",
    tagline: "Visual scenarios, instant + polling triggers.",
    badge: "Verified app",
    href: "https://www.make.com/en/integrations/xyra-chat",
    docsHref: "/docs/integrations/make",
    icon: Workflow,
    color: "from-fuchsia-500 to-purple-500",
  },
  {
    id: "zapier",
    name: "Zapier",
    tagline: "Zaps with REST Hook triggers + creates + searches.",
    badge: "Public",
    href: "https://zapier.com/apps/xyra-chat/integrations",
    docsHref: "/docs/integrations/zapier",
    icon: Plug,
    color: "from-orange-500 to-amber-500",
  },
  {
    id: "n8n",
    name: "n8n",
    tagline: "Self-hosted + cloud, community node.",
    badge: "Community",
    href: "https://www.npmjs.com/package/@xyrachat/n8n-nodes-xyrachat",
    docsHref: "/docs/integrations/n8n",
    icon: FileCode,
    color: "from-emerald-500 to-teal-500",
  },
];

const RECIPES = [
  {
    id: "wa-lead-hubspot",
    title: "WhatsApp lead → HubSpot contact",
    blurb: "When the bot captures a lead, create a HubSpot contact + log a deal.",
    trigger: "bot.lead_captured",
    action: "HubSpot create contact",
    platforms: ["make", "zapier"],
    href: "/docs/integrations/cookbook#wa-lead-hubspot",
  },
  {
    id: "handoff-slack",
    title: "Bot handoff → Slack alert",
    blurb: "Ping #support when a bot escalates to a human.",
    trigger: "bot.handoff",
    action: "Slack send message",
    platforms: ["make", "zapier", "n8n"],
    href: "/docs/integrations/cookbook#handoff-slack",
  },
  {
    id: "new-convo-notion",
    title: "New conversation → Notion row",
    blurb: "Log every new thread to a Notion database for CRM sync.",
    trigger: "conversation.opened",
    action: "Notion create item",
    platforms: ["make", "zapier"],
    href: "/docs/integrations/cookbook#new-convo-notion",
  },
  {
    id: "closed-convo-sheets",
    title: "Closed conversation → Google Sheets",
    blurb: "Append a row to a tracking sheet whenever an agent closes a chat.",
    trigger: "conversation.closed",
    action: "Google Sheets add row",
    platforms: ["make", "zapier", "n8n"],
    href: "/docs/integrations/cookbook#closed-convo-sheets",
  },
  {
    id: "stripe-receipt",
    title: "Stripe payment → WhatsApp receipt",
    blurb: "Send a thank-you template when a Stripe charge succeeds.",
    trigger: "Stripe charge.succeeded",
    action: "Xyra send_message (template)",
    platforms: ["make", "zapier"],
    href: "/docs/integrations/cookbook#stripe-receipt",
  },
  {
    id: "calendly-booking",
    title: "Calendly booking → Xyra contact + tag",
    blurb: "Create a contact and tag them as `booked` when someone books a call.",
    trigger: "Calendly invitee.created",
    action: "Xyra create_contact + add_tag",
    platforms: ["make", "zapier"],
    href: "/docs/integrations/cookbook#calendly-booking",
  },
];

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-12">
        {/* Hero */}
        <header className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/80">
            <Sparkles className="size-3 text-[color:var(--xyra-glow)]" />
            Integrations
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Connect Xyra Chat with <span className="xyra-gradient-text">anything</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Use one of the three big no-code platforms — or build your own with our REST API.
          </p>
        </header>

        {/* Connectors */}
        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-white/50">No-code platforms</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {CONNECTORS.map((c) => {
              const Icon = c.icon;
              return (
                <Card key={c.id} className="border-white/10 bg-card/60 transition hover:border-[color:var(--xyra-glow)]/40">
                  <CardHeader className="pb-3">
                    <div className={`mb-2 inline-flex size-9 items-center justify-center rounded-lg bg-gradient-to-br ${c.color}`}>
                      <Icon className="size-4 text-white" />
                    </div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <Badge
                        variant="outline"
                        className="h-5 border-white/15 bg-white/5 px-1.5 text-[10px] text-white/70"
                      >
                        {c.badge}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1 text-xs">{c.tagline}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-2 text-xs">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                    >
                      <a href={c.href} target="_blank" rel="noopener noreferrer">
                        Open
                        <ArrowRight className="ml-1 size-3" />
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="text-white/60 hover:bg-white/5 hover:text-white"
                    >
                      <Link href={c.docsHref}>Setup guide</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Recipes */}
        <section>
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-white/50">Templates</h2>
          <p className="mb-4 text-xs text-white/50">
            Click any recipe to open the cookbook with step-by-step setup + screenshots.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {RECIPES.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.href}
                  className="group block focus:outline-none"
                >
                  <Card className="h-full border-white/10 bg-card/60 transition group-hover:border-[color:var(--xyra-glow)]/40">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{r.title}</CardTitle>
                      <CardDescription className="text-xs">{r.blurb}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-[10px] text-white/50">
                      <p>
                        <span className="text-white/70">Trigger:</span>{" "}
                        <code className="rounded bg-white/5 px-1.5 py-0.5 text-white/80">{r.trigger}</code>
                      </p>
                      <p className="mt-1">
                        <span className="text-white/70">Action:</span>{" "}
                        <code className="rounded bg-white/5 px-1.5 py-0.5 text-white/80">{r.action}</code>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.platforms.map((p) => (
                          <Badge
                            key={p}
                            variant="outline"
                            className="h-4 border-white/15 bg-white/5 px-1.5 text-[9px] text-white/60"
                          >
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Build-your-own */}
        <section>
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <div className="mb-1 inline-flex size-8 items-center justify-center rounded-lg xyra-gradient">
                <Code2 className="size-4 text-white" />
              </div>
              <CardTitle>Build your own</CardTitle>
              <CardDescription>
                The same REST API + outbound webhooks the connectors above use.
                Bearer auth, cursor pagination, idempotency, Stripe-style HMAC
                signatures. Full OpenAPI spec + Swagger try-it-out.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10">
                <Link href="/docs/api">API reference</Link>
              </Button>
              <Button asChild variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10">
                <Link href="/docs/api/quickstart">Quickstart</Link>
              </Button>
              <Button asChild variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10">
                <Link href="/settings/api">Generate a key</Link>
              </Button>
              <Button asChild variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10">
                <a href="/api/v1/openapi.json" target="_blank" rel="noopener noreferrer">
                  OpenAPI spec
                </a>
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Roadmap teaser */}
        <section className="text-center">
          <Globe className="mx-auto mb-2 size-5 text-white/40" />
          <p className="text-xs text-white/50">
            Don&apos;t see what you need?{" "}
            <a href="mailto:hello@xyrachat.com?subject=Integration%20request" className="underline hover:text-white">
              Request an integration
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
