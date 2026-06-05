// Pure (client- + server-safe) helpers for the business_hours JSONB used by
// both bots.business_hours and bot_assignments.business_hours. The bot gate's
// isWithinHours (lib/ai/bot-gate.ts) reads this exact shape.

export type HoursWindow = { start: string; end: string };

// Day keys match the gate's DAY_KEYS. Display order is Mon→Sun (week start).
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export type BusinessHours = {
  active?: boolean;
  timezone?: string;
} & Partial<Record<DayKey, HoursWindow[]>>;

// HH:MM, 24h. Accepts a single-digit hour (e.g. "9:00") on input; sanitize
// normalizes everything to zero-padded "HH:MM" so string + numeric compares agree.
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
// Defense-in-depth: cap windows/day so a tampered payload can't make the gate's
// isWithinHours loop over an unbounded array on every inbound (hot path).
const MAX_WINDOWS_PER_DAY = 12;

function isValidTime(t: unknown): t is string {
  return typeof t === "string" && TIME_RE.test(t);
}

function normalizeTime(t: string): string {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** True only for a real IANA zone — anything else would throw in Intl at gate time. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A sensible starting schedule: Mon-Fri 09:00–18:00, weekends closed. */
export function defaultBusinessHours(timezone = "UTC"): BusinessHours {
  const weekday: HoursWindow[] = [{ start: "09:00", end: "18:00" }];
  return {
    active: true,
    timezone: isValidTimeZone(timezone) ? timezone : "UTC",
    mon: [...weekday],
    tue: [...weekday],
    wed: [...weekday],
    thu: [...weekday],
    fri: [...weekday],
    sat: [],
    sun: [],
  };
}

/**
 * Coerce arbitrary JSON into a safe BusinessHours that's safe to render AND to
 * persist: an invalid timezone falls back to UTC (an invalid IANA name would
 * throw in the gate's Intl call); each window is kept only if start/end are
 * valid HH:MM with start < end (compared numerically), stored zero-padded; and
 * windows/day are capped. Multiple windows per day are PRESERVED (the gate
 * supports split shifts) — the single-window reduction is the editor's, not here.
 */
export function sanitizeBusinessHours(raw: unknown): BusinessHours {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: BusinessHours = {
    active: Boolean(obj.active),
    timezone: isValidTimeZone(obj.timezone) ? (obj.timezone as string) : "UTC",
  };
  for (const day of DAY_KEYS) {
    const windows = obj[day];
    if (!Array.isArray(windows)) {
      out[day] = [];
      continue;
    }
    const clean: HoursWindow[] = [];
    for (const w of windows.slice(0, MAX_WINDOWS_PER_DAY)) {
      if (
        w &&
        typeof w === "object" &&
        isValidTime((w as HoursWindow).start) &&
        isValidTime((w as HoursWindow).end) &&
        toMinutes((w as HoursWindow).start) < toMinutes((w as HoursWindow).end)
      ) {
        clean.push({
          start: normalizeTime((w as HoursWindow).start),
          end: normalizeTime((w as HoursWindow).end),
        });
      }
    }
    out[day] = clean;
  }
  return out;
}

/** First window for a day, or null when the day is closed. */
export function dayWindow(hours: BusinessHours, day: DayKey): HoursWindow | null {
  const w = hours[day];
  return Array.isArray(w) && w.length > 0 ? w[0] : null;
}

/** True when every day is closed (no windows on any day). */
export function allDaysClosed(hours: BusinessHours): boolean {
  return DAY_KEYS.every((d) => !dayWindow(hours, d));
}

/**
 * Human summary like "Mon–Fri 09:00–18:00 · UTC", collapsing consecutive days
 * that share the same window into a range so it fits a compact header.
 */
export function summarizeBusinessHours(hours: BusinessHours): string {
  if (!hours.active) return "Always on (24/7)";
  const tz = hours.timezone ?? "UTC";
  const open = DAY_KEYS.map((d) => ({ d, w: dayWindow(hours, d) })).filter(
    (x): x is { d: DayKey; w: HoursWindow } => x.w !== null,
  );
  if (open.length === 0) return "Closed every day";

  type Seg = { startDay: DayKey; endDay: DayKey; w: HoursWindow; endIdx: number };
  const segs: Seg[] = [];
  for (const { d, w } of open) {
    const idx = DAY_KEYS.indexOf(d);
    const last = segs[segs.length - 1];
    if (last && idx === last.endIdx + 1 && last.w.start === w.start && last.w.end === w.end) {
      last.endDay = d;
      last.endIdx = idx;
    } else {
      segs.push({ startDay: d, endDay: d, w, endIdx: idx });
    }
  }
  const parts = segs.map((s) => {
    const a = DAY_LABELS[s.startDay].slice(0, 3);
    const label = s.startDay === s.endDay ? a : `${a}–${DAY_LABELS[s.endDay].slice(0, 3)}`;
    return `${label} ${s.w.start}–${s.w.end}`;
  });
  return `${parts.join(", ")} · ${tz}`;
}
