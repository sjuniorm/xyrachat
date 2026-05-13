"use client";

import { useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { changeMemberRole } from "@/lib/team/actions";
import type { ProfileRole } from "@/lib/db-types";

const ROLE_LABEL: Record<ProfileRole, string> = {
  owner: "Owner",
  admin: "Admin",
  supervisor: "Supervisor",
  agent: "Agent",
};

export function ChangeRoleMenu({
  userId,
  currentRole,
  myRole,
}: {
  userId: string;
  currentRole: ProfileRole;
  myRole: ProfileRole;
}) {
  const [pending, startTransition] = useTransition();

  // Owners can pick any role for anyone. Admins can pick supervisor/agent
  // only, and only for non-admins/non-owners. The action validates again
  // server-side — this is just for menu UX.
  const choices: ProfileRole[] =
    myRole === "owner"
      ? ["owner", "admin", "supervisor", "agent"]
      : ["supervisor", "agent"];

  function pick(role: ProfileRole) {
    if (role === currentRole) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("user_id", userId);
      fd.set("role", role);
      const r = await changeMemberRole(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Role changed to ${ROLE_LABEL[role]}`);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          className="h-8 shrink-0 gap-1 px-2 text-xs text-white/70 hover:bg-white/5 hover:text-white"
        >
          Change role
          <ChevronDown className="size-3 text-white/50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs">Set role</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {choices.map((r) => (
          <DropdownMenuItem
            key={r}
            onClick={() => pick(r)}
            disabled={pending}
            className="flex items-center justify-between"
          >
            <span>{ROLE_LABEL[r]}</span>
            {r === currentRole && (
              <Check className="size-3.5 text-white/60" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
