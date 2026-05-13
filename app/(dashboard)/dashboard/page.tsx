import { redirect } from "next/navigation";
import { Bot, Inbox, Megaphone, MessageCircle, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle>Broadcasts</CardTitle>
            <CardDescription>
              Send WhatsApp template messages to thousands of contacts at once,
              with segmentation and delivery tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/40">
              <Megaphone className="mr-1.5 inline size-3.5" />
              Ships Week 8.
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle>Automations</CardTitle>
            <CardDescription>
              AI bots that answer customer questions from your knowledge base,
              route conversations and trigger workflows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/40">
              <Bot className="mr-1.5 inline size-3.5" />
              Ships Week 6.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
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
