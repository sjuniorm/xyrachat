"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelIcon, channelLabel } from "@/components/ui/channel-icon";
import { setChannelAssignment, setAssignmentRouting } from "@/lib/bots/actions";
import type { Channel as ChannelRow } from "@/lib/mock-data";

export function AssignTab({
  botId,
  channels,
  assignments,
}: {
  botId: string;
  channels: Array<{ id: string; type: string; name: string }>;
  assignments: Array<{
    channel_id: string;
    active: boolean;
    routing_description: string | null;
  }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      assignments.filter((a) => a.active).map((a) => [a.channel_id, true]),
    ),
  );
  const [routing, setRouting] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      assignments.map((a) => [a.channel_id, a.routing_description ?? ""]),
    ),
  );

  function toggle(channelId: string, value: boolean) {
    setActive((prev) => ({ ...prev, [channelId]: value }));
    startTransition(async () => {
      const r = await setChannelAssignment(botId, channelId, value);
      if (!r.ok) {
        toast.error(r.error);
        setActive((prev) => ({ ...prev, [channelId]: !value }));
        return;
      }
      toast.success(value ? "Bot assigned." : "Bot unassigned.");
      router.refresh();
    });
  }

  function saveRouting(channelId: string) {
    startTransition(async () => {
      const r = await setAssignmentRouting(botId, channelId, routing[channelId] ?? "");
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader>
        <CardTitle className="text-base">Channel assignments</CardTitle>
        <CardDescription>
          Assign this bot to channels. Multiple bots can share a channel —
          incoming chats are routed to the best-matching bot by intent. Add a
          routing hint so the router knows when to pick this one.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {channels.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-white/60">
            No channels connected yet. Add one from Settings → Channels.
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {channels.map((c) => (
              <li key={c.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <ChannelIcon channel={c.type as ChannelRow} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{c.name}</p>
                    <p className="truncate text-xs text-white/50">
                      {channelLabel(c.type as ChannelRow)}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(active[c.id])}
                    onCheckedChange={(v) => toggle(c.id, v)}
                    disabled={pending}
                    aria-label={`Assign bot to ${c.name}`}
                  />
                </div>
                {active[c.id] && (
                  <div className="mt-2.5 pl-9">
                    <Input
                      value={routing[c.id] ?? ""}
                      onChange={(e) =>
                        setRouting((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      onBlur={() => saveRouting(c.id)}
                      maxLength={280}
                      placeholder="Route here when… e.g. pricing, plans, upgrades"
                      className="h-8 text-xs"
                    />
                    <p className="mt-1 text-[10px] text-white/40">
                      Only used when more than one bot shares this channel.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
