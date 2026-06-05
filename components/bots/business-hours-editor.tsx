"use client";

import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  allDaysClosed,
  DAY_KEYS,
  DAY_LABELS,
  dayWindow,
  type BusinessHours,
  type DayKey,
} from "@/lib/bots/business-hours";

// Curated fallback for runtimes without Intl.supportedValuesOf (older WebViews).
const FALLBACK_TZ = [
  "UTC",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/**
 * Edits the per-day windows + timezone of a BusinessHours object. One window
 * per day (the common case); a day with no window = closed. Parents own the
 * "active"/"inherit" wrapper so this is reusable for both the bot's own
 * schedule and a per-channel override.
 */
export function BusinessHoursEditor({
  value,
  onChange,
  disabled,
}: {
  value: BusinessHours;
  onChange: (next: BusinessHours) => void;
  disabled?: boolean;
}) {
  const timezones = useMemo(() => {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    let list = FALLBACK_TZ;
    try {
      if (typeof sv === "function") list = sv("timeZone");
    } catch {
      list = FALLBACK_TZ;
    }
    const tz = value.timezone ?? "UTC";
    return list.includes(tz) ? list : [tz, ...list];
  }, [value.timezone]);

  function setDayOpen(day: DayKey, open: boolean) {
    onChange({
      ...value,
      [day]: open ? [{ start: "09:00", end: "18:00" }] : [],
    });
  }

  function setDayTime(day: DayKey, field: "start" | "end", time: string) {
    const w = dayWindow(value, day) ?? { start: "09:00", end: "18:00" };
    onChange({ ...value, [day]: [{ ...w, [field]: time }] });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-white/70">Timezone</Label>
        <select
          value={value.timezone ?? "UTC"}
          onChange={(e) => onChange({ ...value, timezone: e.target.value })}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white"
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz} className="bg-card">
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div className="divide-y divide-white/5 rounded-md border border-white/10">
        {DAY_KEYS.map((day) => {
          const w = dayWindow(value, day);
          const open = Boolean(w);
          const extraWindows = (value[day]?.length ?? 0) - 1;
          return (
            <div key={day} className="flex items-center gap-3 px-3 py-2">
              <div className="flex w-28 items-center gap-2">
                <Switch
                  checked={open}
                  onCheckedChange={(v) => setDayOpen(day, v)}
                  disabled={disabled}
                  aria-label={`${DAY_LABELS[day]} open`}
                />
                <span className="text-sm text-white/80">{DAY_LABELS[day].slice(0, 3)}</span>
              </div>
              {open ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    value={w!.start}
                    onChange={(e) => setDayTime(day, "start", e.target.value)}
                    disabled={disabled}
                    className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white [color-scheme:dark]"
                  />
                  <span className="text-white/40">–</span>
                  <input
                    type="time"
                    value={w!.end}
                    onChange={(e) => setDayTime(day, "end", e.target.value)}
                    disabled={disabled}
                    className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white [color-scheme:dark]"
                  />
                  {extraWindows > 0 && (
                    <span className="text-[10px] text-amber-300/80">
                      +{extraWindows} more window{extraWindows > 1 ? "s" : ""} — editing replaces them
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-white/40">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      {allDaysClosed(value) && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-300/90">
          <TriangleAlert className="size-3.5 shrink-0" />
          Every day is closed — the bot won&apos;t reply while hours are enforced.
        </p>
      )}
    </div>
  );
}
