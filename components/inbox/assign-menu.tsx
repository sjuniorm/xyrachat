"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assignConversation } from "@/lib/inbox/actions";
import type { TeamMember } from "@/lib/team/server";
import { cn } from "@/lib/utils";

const AVAIL_DOT: Record<string, string> = {
  online: "bg-emerald-400",
  away: "bg-amber-400",
  offline: "bg-zinc-500",
};

export function AssignMenu({
  conversationId,
  currentAgentId,
  members,
  currentUserId,
}: {
  conversationId: string;
  currentAgentId: string | null;
  members: TeamMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function assign(agentId: string | null) {
    if (agentId === currentAgentId) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("conversation_id", conversationId);
      fd.set("agent_id", agentId ?? "null");
      const r = await assignConversation(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(agentId ? "Assigned" : "Unassigned");
      router.refresh();
    });
  }

  // Put "you" first, then the rest alphabetical by name.
  const sorted = [...members].sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    return (a.full_name ?? a.email ?? "").localeCompare(
      b.full_name ?? b.email ?? "",
    );
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          className="h-8 shrink-0 gap-1.5 px-2 md:px-3"
          aria-label="Assign agent"
        >
          <UserPlus className="size-4 md:hidden" />
          <span className="hidden md:inline">Assign</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Assign to</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => assign(null)}
          className="text-white/70"
        >
          {currentAgentId === null && <Check className="mr-2 size-3.5" />}
          {currentAgentId === null ? null : (
            <span className="mr-2 inline-block size-3.5" />
          )}
          Unassigned
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {sorted.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-white/40">
            No team members yet. Invite one in Settings → Team.
          </DropdownMenuItem>
        ) : (
          sorted.map((m) => {
            const active = m.id === currentAgentId;
            const initials = (m.full_name ?? m.email ?? "?")
              .split(/\s+/)
              .map((s) => s[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <DropdownMenuItem
                key={m.id}
                onClick={() => assign(m.id)}
                className="flex items-center gap-2"
              >
                {active ? (
                  <Check className="size-3.5 shrink-0" />
                ) : (
                  <span className="inline-block size-3.5 shrink-0" />
                )}
                <div className="relative">
                  <Avatar className="size-6">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
                    <AvatarFallback className="text-[9px]">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      "absolute right-0 bottom-0 size-1.5 rounded-full ring-1 ring-card",
                      AVAIL_DOT[m.availability],
                    )}
                  />
                </div>
                <span className="truncate">
                  {m.full_name ?? m.email ?? "Unnamed"}
                  {m.id === currentUserId && (
                    <span className="ml-1 text-xs text-white/40">(you)</span>
                  )}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
