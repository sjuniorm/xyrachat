import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox, Users, Megaphone, Bot } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to <span className="xyra-gradient-text">Xyra Chat</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your unified inbox is ready. Connect a channel to start messaging your customers.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Inbox} label="Open conversations" value="0" />
        <StatCard icon={Users} label="Contacts" value="0" />
        <StatCard icon={Megaphone} label="Broadcasts sent" value="0" />
        <StatCard icon={Bot} label="Active automations" value="0" />
      </div>

      <Card className="mt-10 border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle>Connect your first channel</CardTitle>
          <CardDescription>
            WhatsApp, Instagram, Messenger or live chat — bring it all into one inbox.
            Channel onboarding ships next week.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
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
  value: string;
}) {
  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
