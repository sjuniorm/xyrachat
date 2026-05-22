"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelIcon, channelLabel } from "@/components/ui/channel-icon";
import { setChannelAssignment } from "@/lib/bots/actions";
import type { Channel as ChannelRow } from "@/lib/mock-data";

export function AssignTab({
  botId,
  channels,
  assignments,
}: {
  botId: string;
  channels: Array<{ id: string; type: string; name: string }>;
  assignments: Array<{ channel_id: string; active: boolean }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Local toggle state so the UI feels instant — we revalidate after the
  // server action confirms.
  const [active, setActive] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(assignments.filter((a) => a.active).map((a) => [a.channel_id, true])),
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

  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader>
        <CardTitle className="text-base">Channel assignments</CardTitle>
        <CardDescription>
          Toggle this bot on per channel. Only one bot can be active per channel
          — turning this on automatically replaces any other bot already there.
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
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
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
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
