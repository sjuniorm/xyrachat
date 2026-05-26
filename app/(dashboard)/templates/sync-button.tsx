"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncTemplates } from "@/lib/templates/actions";

export function SyncTemplatesButton() {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      className="border-white/10 bg-white/5 text-white hover:bg-white/10"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await syncTemplates();
        setBusy(false);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          res.data?.updated
            ? `Synced ${res.data.updated} template${res.data.updated === 1 ? "" : "s"} from Meta`
            : "Already up to date",
        );
        startTransition(() => {
          // revalidatePath inside the action already refreshes the RSC tree.
        });
      }}
    >
      <RefreshCw className={`mr-1.5 size-4 ${busy ? "animate-spin" : ""}`} />
      Sync from Meta
    </Button>
  );
}
