"use client";

import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// WhatsApp's 24-hour customer-service window. Free-form replies are
// allowed any time within 24h of the contact's last inbound message.
// After that, Meta requires a pre-approved template to message them
// (Marketing / Utility / Authentication).
//
// We show a live-counting chip in the message-thread top bar so agents
// know at a glance whether they can text back or need a template.
// Re-renders every 30s — granular enough to see the countdown move,
// cheap enough not to matter.
const WINDOW_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 30_000;

export function WhatsAppWindowTimer({
  lastInboundAt,
}: {
  lastInboundAt: string | null;
}) {
  // useState seed runs server-side too; tick on the client only.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now()); // catch up after hydration
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // No inbound yet — most likely this conversation started outbound
  // (e.g. a broadcast). The 24h window only opens after the customer
  // sends something, so until they do, only templates are allowed.
  if (!lastInboundAt) {
    return (
      <span
        className="hidden md:inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300"
        title="The customer hasn't messaged yet — only templates can be sent."
      >
        <AlertTriangle className="size-3" />
        Template only
      </span>
    );
  }

  const elapsed = now - new Date(lastInboundAt).getTime();
  const remaining = WINDOW_MS - elapsed;

  if (remaining <= 0) {
    // Window closed — they have to start a fresh template.
    return (
      <span
        className="hidden md:inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[10px] text-red-300"
        title="24h reply window expired — send a template to start a new conversation."
      >
        <AlertTriangle className="size-3" />
        Window closed
      </span>
    );
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  // Color tiers — green > 12h, amber 1-12h, red < 1h.
  const tone =
    hours >= 12
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : hours >= 1
        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
        : "border-red-400/30 bg-red-400/10 text-red-300";

  const label =
    hours >= 1
      ? `${hours}h ${minutes}m left`
      : `${minutes}m left`;

  return (
    <span
      className={cn(
        "hidden md:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tabular-nums",
        tone,
      )}
      title="WhatsApp 24-hour reply window. Resets every time the customer messages you."
    >
      <Clock className="size-3" />
      {label}
    </span>
  );
}
