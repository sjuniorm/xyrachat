"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const NAMES: Record<string, string> = { hubspot: "HubSpot", pipedrive: "Pipedrive", salesforce: "Salesforce" };

// One-time toast for ?connected=/?error=, then strips the query so it doesn't
// stick on reload.
export function CrmFlash({ connected, error }: { connected?: string; error?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (connected) {
      toast.success(`${NAMES[connected] ?? "CRM"} connected.`);
    } else if (error) {
      toast.error(
        error === "not_configured"
          ? "That CRM isn't enabled yet (operator setup pending)."
          : error === "forbidden"
            ? "Owners/admins only."
            : `Couldn't connect: ${error}`,
      );
    }
    if (connected || error) router.replace("/settings/crm", { scroll: false });
  }, [connected, error, router]);
  return null;
}
