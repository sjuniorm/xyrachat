import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bot, FileText, Inbox, Megaphone, MessageCircle, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Real counts, RLS-scoped to the user's org.
  const [
    openConvosRes,
    contactsRes,
    channelsRes,
    botConvosRes,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "bot"),
  ]);

  const openConvos = openConvosRes.count ?? 0;
  const contacts = contactsRes.count ?? 0;
  const channels = channelsRes.count ?? 0;
  const botConvos = botConvosRes.count ?? 0;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to <span className="xyra-gradient-text">Xyra Chat</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          {channels === 0
            ? "Your unified inbox is ready. Connect a channel to start messaging your customers."
            : "Your unified inbox is live."}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Inbox} label="Open conversations" value={openConvos} />
        <StatCard icon={Users} label="Contacts" value={contacts} />
        <StatCard
          icon={MessageCircle}
          label="Active channels"
          value={channels}
        />
        <StatCard icon={Bot} label="Bot conversations" value={botConvos} />
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <FeatureCard
          icon={Bot}
          title="AI Chatbots"
          blurb="Train assistants on your knowledge base. Pick an objective, drop in URLs or text, assign to a channel."
          href="/bots"
          cta="Open Bots"
        />
        <FeatureCard
          icon={FileText}
          title="WhatsApp templates"
          blurb="Pre-approved messages required to start conversations outside the 24-hour reply window."
          href="/templates"
          cta="Open Templates"
        />
        <FeatureCard
          icon={Megaphone}
          title="Broadcasts"
          blurb="Send a template to filtered audiences with variable substitution and delivery tracking."
          href="/broadcasts"
          cta="Open Broadcasts"
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  blurb,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
  href: string;
  cta: string;
}) {
  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader>
        <div className="mb-1 inline-flex size-8 items-center justify-center rounded-lg xyra-gradient">
          <Icon className="size-4 text-white" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{blurb}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10">
          <Link href={href}>
            {cta}
            <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">
          {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
