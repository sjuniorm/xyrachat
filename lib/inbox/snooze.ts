// Human-friendly "until X" string for a snoozed conversation.
// Examples: "until 9 AM", "until tomorrow 9 AM", "until Tue 22 May".
export function formatSnoozeUntil(iso: string): string {
  const target = new Date(iso);
  const now = new Date();
  const sameDay = target.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = target.toDateString() === tomorrow.toDateString();

  const timeStr = target.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameDay) return `until ${timeStr}`;
  if (isTomorrow) return `until tomorrow ${timeStr}`;

  const within7Days = target.getTime() - now.getTime() < 7 * 24 * 3600 * 1000;
  if (within7Days) {
    const weekday = target.toLocaleDateString([], { weekday: "short" });
    return `until ${weekday} ${timeStr}`;
  }
  return `until ${target.toLocaleDateString([], { day: "numeric", month: "short" })}`;
}
