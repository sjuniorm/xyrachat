"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type GetStartedStep = {
  key: string;
  label: string;
  href: string;
  done: boolean;
};

const DISMISS_KEY = "xyra:getStarted:dismissed";

// Onboarding checklist on the dashboard. Hidden once every step is done OR the
// user dismisses it (per-device localStorage). Step completion is computed
// server-side from real org metrics and passed in.
export function GetStartedWidget({ steps }: { steps: GetStartedStep[] }) {
  const allDone = steps.every((s) => s.done);
  // Default hidden so SSR + first client render match; the effect reveals it.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(allDone || localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setHidden(allDone);
    }
  }, [allDone]);

  if (hidden) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="mb-8 border-[color:var(--xyra-purple)]/30 bg-[color:var(--xyra-purple)]/5">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Get started</CardTitle>
          <p className="mt-1 text-xs text-white/55">
            {doneCount} of {steps.length} complete — finish setup to go live.
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded p-1 text-white/40 hover:bg-white/5 hover:text-white"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
            setHidden(true);
          }}
        >
          <X className="size-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full xyra-gradient transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="divide-y divide-white/5">
          {steps.map((s) => (
            <li key={s.key}>
              {s.done ? (
                <div className="flex items-center gap-3 py-2.5">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                    <Check className="size-3" />
                  </span>
                  <span className="text-sm text-white/50 line-through">{s.label}</span>
                </div>
              ) : (
                <Link
                  href={s.href}
                  className="group flex items-center gap-3 py-2.5 transition hover:opacity-90"
                >
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-white/20" />
                  <span className="text-sm text-white/85">{s.label}</span>
                  <ArrowRight className="ml-auto size-3.5 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/60" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
