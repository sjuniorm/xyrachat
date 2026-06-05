"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelIcon, channelLabel } from "@/components/ui/channel-icon";
import {
  setChannelAssignment,
  setAssignmentRouting,
  setAssignmentSchedule,
} from "@/lib/bots/actions";
import { BusinessHoursEditor } from "@/components/bots/business-hours-editor";
import {
  defaultBusinessHours,
  sanitizeBusinessHours,
  summarizeBusinessHours,
  type BusinessHours,
} from "@/lib/bots/business-hours";
import type { Channel as ChannelRow } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// The agent's local zone, used to pre-fill a fresh schedule instead of UTC.
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

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
    business_hours: unknown | null;
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
  // Per-channel schedule: whether a custom override is set + the edited value.
  const [override, setOverride] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      assignments.map((a) => [a.channel_id, a.business_hours != null]),
    ),
  );
  const [schedule, setSchedule] = useState<Record<string, BusinessHours>>(() =>
    Object.fromEntries(
      assignments.map((a) => [
        a.channel_id,
        a.business_hours != null
          ? sanitizeBusinessHours(a.business_hours)
          : defaultBusinessHours(),
      ]),
    ),
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  function saveSchedule(channelId: string) {
    const value = override[channelId] ? schedule[channelId] : null;
    startTransition(async () => {
      const r = await setAssignmentSchedule(botId, channelId, value);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(value ? "Channel schedule saved." : "Using the bot's default hours.");
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
          routing hint so the router knows when to pick this one, and optionally
          give the bot its own schedule per channel.
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
                  <div className="mt-2.5 space-y-3 pl-9">
                    <div>
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

                    {/* Per-channel schedule */}
                    <div className="rounded-md border border-white/10 bg-white/[0.02]">
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
                        }
                        className="flex w-full items-center gap-2 px-3 py-2 text-left"
                      >
                        <Clock className="size-3.5 text-white/50" />
                        <span className="text-xs font-medium text-white/80">Schedule</span>
                        <span className="ml-1 truncate text-[10px] text-white/40">
                          {override[c.id]
                            ? summarizeBusinessHours(schedule[c.id])
                            : "Bot's default hours"}
                        </span>
                        <ChevronDown
                          className={cn(
                            "ml-auto size-3.5 text-white/50 transition-transform",
                            expanded[c.id] && "rotate-180",
                          )}
                        />
                      </button>

                      {expanded[c.id] && (
                        <div className="space-y-3 border-t border-white/5 px-3 py-3">
                          <label className="flex items-center justify-between gap-3 text-xs text-white/80">
                            <span>Custom hours for this channel</span>
                            <Switch
                              checked={Boolean(override[c.id])}
                              onCheckedChange={(v) => {
                                setOverride((prev) => ({ ...prev, [c.id]: v }));
                                // Pre-fill the agent's local zone (vs default UTC)
                                // the first time a custom schedule is turned on.
                                if (v) {
                                  setSchedule((prev) => {
                                    const cur = prev[c.id];
                                    if (cur?.timezone && cur.timezone !== "UTC") return prev;
                                    return {
                                      ...prev,
                                      [c.id]: { ...cur, timezone: browserTimeZone() },
                                    };
                                  });
                                }
                              }}
                              disabled={pending}
                            />
                          </label>

                          {override[c.id] ? (
                            <>
                              <label className="flex items-center justify-between gap-3 text-xs text-white/80">
                                <span>Enforce hours (off = 24/7 on this channel)</span>
                                <Switch
                                  checked={Boolean(schedule[c.id]?.active)}
                                  onCheckedChange={(v) =>
                                    setSchedule((prev) => ({
                                      ...prev,
                                      [c.id]: { ...prev[c.id], active: v },
                                    }))
                                  }
                                  disabled={pending}
                                />
                              </label>
                              {schedule[c.id]?.active && (
                                <BusinessHoursEditor
                                  value={schedule[c.id]}
                                  onChange={(next) =>
                                    setSchedule((prev) => ({ ...prev, [c.id]: next }))
                                  }
                                  disabled={pending}
                                />
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] text-white/45">
                              This channel uses the bot's default business hours
                              (Settings → Business hours).
                            </p>
                          )}

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={pending}
                              onClick={() => saveSchedule(c.id)}
                            >
                              Save schedule
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
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
