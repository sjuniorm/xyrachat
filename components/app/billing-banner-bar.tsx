"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Dismissible bar. Dismissal is per-session (sessionStorage) keyed by the
// banner id, so it reappears on next login but doesn't nag within a
// session. The `id` also lets a state change (e.g. trial → past_due)
// show a fresh banner even if a prior one was dismissed.
const TONES: Record<string, string> = {
  red: "border-red-400/30 bg-red-400/10 text-red-200",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  sky: "border-sky-400/30 bg-sky-400/10 text-sky-200",
};

export function BannerBar({
  id,
  tone,
  children,
}: {
  id: string;
  tone: "red" | "amber" | "sky";
  children: React.ReactNode;
}) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid SSR flash
  useEffect(() => {
    setDismissed(sessionStorage.getItem(`xyra_banner_${id}`) === "1");
  }, [id]);

  if (dismissed) return null;
  return (
    <div className={`flex items-center gap-3 border-b px-4 py-2 text-xs ${TONES[tone]}`}>
      <span className="flex-1">{children}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          sessionStorage.setItem(`xyra_banner_${id}`, "1");
          setDismissed(true);
        }}
        className="shrink-0 opacity-70 hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
