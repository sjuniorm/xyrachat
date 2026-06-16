"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { updateAgentPermissions } from "@/lib/team/actions";
import type { AgentPermissions } from "@/lib/team/permissions";

const ROWS: Array<{ key: keyof AgentPermissions; label: string; help: string; invert?: boolean }> = [
  {
    key: "restrict_to_assigned",
    label: "Limit agents to their own chats",
    help: "Agents only see conversations assigned to them or unassigned — not other agents' chats.",
  },
  { key: "can_delete_conversations", label: "Agents can delete conversations", help: "Turn off to stop agents deleting conversations." },
  { key: "can_edit_contacts", label: "Agents can edit contacts", help: "Turn off to make contact details read-only for agents." },
  { key: "can_export", label: "Agents can export data", help: "Turn off to block agents from CSV/analytics export." },
];

// Owner/admin control over what the junior `agent` role can do. Defaults match
// today's behaviour; only `agent` is constrained.
export function AgentPermissionsCard({ initial }: { initial: AgentPermissions }) {
  const router = useRouter();
  const [perms, setPerms] = useState<AgentPermissions>(initial);
  const [pending, start] = useTransition();

  function set(key: keyof AgentPermissions, value: boolean) {
    const next = { ...perms, [key]: value };
    setPerms(next);
    start(async () => {
      const res = await updateAgentPermissions(next);
      if (!res.ok) {
        toast.error(res.error);
        setPerms(perms); // revert
        return;
      }
      toast.success("Agent permissions updated.");
      router.refresh();
    });
  }

  return (
    <Card className="mt-6 border-white/10 bg-card/60">
      <CardHeader>
        <CardTitle className="text-base">Agent permissions</CardTitle>
        <CardDescription>
          Control what your <strong>agents</strong> can do. Owners, admins and supervisors
          aren&apos;t affected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-start justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-white">{r.label}</p>
              <p className="text-xs text-white/55">{r.help}</p>
            </div>
            <Switch
              checked={perms[r.key]}
              disabled={pending}
              onCheckedChange={(v) => set(r.key, v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
