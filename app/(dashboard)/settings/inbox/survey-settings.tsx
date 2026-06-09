"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setSurveyKind } from "@/lib/surveys/actions";

const OPTIONS: { value: "off" | "csat" | "nps"; label: string; blurb: string }[] = [
  { value: "off", label: "Off", blurb: "No survey is sent." },
  { value: "csat", label: "CSAT", blurb: "1–5 satisfaction rating on close." },
  { value: "nps", label: "NPS", blurb: "0–10 recommend score on close." },
];

export function SurveySettings({
  initial,
  canEdit,
}: {
  initial: "off" | "csat" | "nps";
  canEdit: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function choose(next: "off" | "csat" | "nps") {
    if (!canEdit || next === value) return;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const r = await setSurveyKind(next);
      if (!r.ok) {
        setValue(prev);
        toast.error(r.error);
        return;
      }
      toast.success(next === "off" ? "Surveys turned off." : `${next.toUpperCase()} surveys on.`);
    });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={!canEdit || pending}
          onClick={() => choose(o.value)}
          className={`rounded-lg border p-3 text-left transition disabled:opacity-60 ${
            value === o.value
              ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-purple)]/10"
              : "border-white/10 bg-white/5 hover:bg-white/10"
          }`}
        >
          <div className="text-sm font-medium text-white">{o.label}</div>
          <div className="mt-0.5 text-[11px] text-white/50">{o.blurb}</div>
        </button>
      ))}
    </div>
  );
}
