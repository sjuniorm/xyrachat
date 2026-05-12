import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelIcon, channelLabel } from "@/components/ui/channel-icon";
import { createClient } from "@/lib/supabase/server";
import type { ChannelRow } from "@/lib/db-types";

export default async function ChannelsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: channels } = await supabase
    .from("channels")
    .select("*")
    .order("created_at", { ascending: false });
  const list = (channels as ChannelRow[] | null) ?? [];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect WhatsApp, Instagram, Messenger and more so messages land in your inbox.
            </p>
          </div>
          <Button asChild className="xyra-gradient text-white border-0 hover:opacity-90">
            <Link href="/settings/channels/new">
              <Plus className="mr-1.5 size-4" />
              Add channel
            </Link>
          </Button>
        </header>

        {list.length === 0 ? (
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle>No channels connected yet</CardTitle>
              <CardDescription>
                Add your first WhatsApp Business sender to start receiving customer messages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="xyra-gradient text-white border-0 hover:opacity-90">
                <Link href="/settings/channels/new">
                  <Plus className="mr-1.5 size-4" />
                  Add WhatsApp channel
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {list.map((c) => (
              <li key={c.id}>
                <Card className="border-white/10 bg-card/60">
                  <CardContent className="flex items-center gap-4 py-4">
                    <ChannelIcon channel={c.type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-white">{c.name}</p>
                        <Badge
                          variant="outline"
                          className={
                            c.active
                              ? "h-5 border-emerald-400/30 bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300"
                              : "h-5 border-zinc-500/30 bg-zinc-500/20 px-1.5 text-[10px] text-zinc-300"
                          }
                        >
                          {c.active ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {channelLabel(c.type)}
                        {c.phone_number_id && ` · ID ${c.phone_number_id}`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
