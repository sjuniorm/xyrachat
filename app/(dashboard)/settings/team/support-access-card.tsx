"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  grantSupportAccess,
  revokeSupportAccess,
  type ActiveGrant,
  type SupportScope,
} from "@/lib/support/access";

const SELECT_CLASS =
  "mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white";

export function SupportAccessCard({ grant }: { grant: ActiveGrant | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [duration, setDuration] = useState("7");
  const [scope, setScope] = useState<SupportScope>("read_reply");

  function grant_() {
    start(async () => {
      const res = await grantSupportAccess(duration, scope);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Xyra Support can now access your workspace.");
      router.refresh();
    });
  }

  function revoke_() {
    start(async () => {
      const res = await revokeSupportAccess();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Support access revoked.");
      router.refresh();
    });
  }

  return (
    <Card className="mt-6 border-white/10 bg-card/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LifeBuoy className="size-4 text-[color:var(--xyra-glow)]" />
          Support access
        </CardTitle>
        <CardDescription>
          Let Xyra Support enter your workspace to help — time-boxed, revocable,
          and logged. Off by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {grant ? (
          <div className="flex flex-col gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" />
              <div>
                <p className="font-medium text-white">
                  Xyra Support can access this workspace
                </p>
                <p className="text-white/60" suppressHydrationWarning>
                  {grant.scope === "read_only" ? "View-only" : "View & reply"} ·
                  until {new Date(grant.expires_at).toLocaleString()}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={revoke_}
              disabled={pending}
              className="border-rose-400/30 text-rose-200 hover:bg-rose-400/10"
            >
              {pending ? "Revoking…" : "Revoke now"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs text-white/60">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="1">24 hours</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-white/60">What they can do</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as SupportScope)}
                className={SELECT_CLASS}
              >
                <option value="read_reply">View &amp; reply</option>
                <option value="read_only">View only</option>
              </select>
            </div>
            <Button
              onClick={grant_}
              disabled={pending}
              className="xyra-gradient text-white"
            >
              {pending ? "Granting…" : "Allow Xyra Support"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
