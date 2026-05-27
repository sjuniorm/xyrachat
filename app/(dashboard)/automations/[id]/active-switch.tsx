"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setAutomationActive } from "@/lib/automations/actions";

export function ActiveSwitch({ id, active }: { id: string; active: boolean }) {
  const [on, setOn] = useState(active);
  const [, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-xs text-white/70">
      <Switch
        checked={on}
        onCheckedChange={(next) => {
          setOn(next);
          startTransition(async () => {
            const res = await setAutomationActive(id, next);
            if (!res.ok) {
              setOn(!next);
              toast.error(res.error);
            }
          });
        }}
      />
      {on ? "Active" : "Paused"}
    </label>
  );
}
