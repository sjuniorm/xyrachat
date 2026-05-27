"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteAutomation } from "@/lib/automations/actions";

export function DeleteButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        if (!confirm("Delete this automation? Existing logs are kept for analytics.")) return;
        setBusy(true);
        const res = await deleteAutomation(id);
        if ("error" in res && !res.ok) {
          setBusy(false);
          toast.error(res.error);
        }
      }}
      className="border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20"
    >
      <Trash2 className="mr-1.5 size-3.5" />
      Delete
    </Button>
  );
}
