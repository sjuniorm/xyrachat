"use client";

import { useTransition } from "react";
import { Check, CheckCircle, Trash2, UserPlus, X } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assignConversationsBulk,
  deleteConversationsBulk,
  setConversationsStatusBulk,
} from "@/lib/inbox/actions";
import type { TeamMember } from "@/lib/team/server";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function BulkActionsBar({
  selectedIds,
  totalVisible,
  allSelected,
  onToggleAll,
  onClear,
  members,
  onActionDone,
}: {
  selectedIds: string[];
  totalVisible: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  members: TeamMember[];
  onActionDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function run<T extends { ok: boolean; error?: string }>(
    label: string,
    fn: () => Promise<T>,
  ) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error("error" in r && r.error ? r.error : "Action failed");
        return;
      }
      toast.success(`${label} ✓`);
      onActionDone();
    });
  }

  function bulkAssign(agentId: string | null) {
    const fd = new FormData();
    fd.set("conversation_ids", selectedIds.join(","));
    fd.set("agent_id", agentId ?? "null");
    run(
      agentId ? `Assigned ${selectedIds.length}` : `Unassigned ${selectedIds.length}`,
      () => assignConversationsBulk(fd),
    );
  }

  function bulkClose() {
    const fd = new FormData();
    fd.set("conversation_ids", selectedIds.join(","));
    fd.set("status", "closed");
    run(`Closed ${selectedIds.length}`, () => setConversationsStatusBulk(fd));
  }

  function bulkDelete() {
    const fd = new FormData();
    fd.set("conversation_ids", selectedIds.join(","));
    run(`Deleted ${selectedIds.length}`, () => deleteConversationsBulk(fd));
    setConfirmDelete(false);
  }

  return (
    <div className="flex items-center gap-2 border-b border-white/5 bg-[color:var(--xyra-purple)]/10 px-2 py-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={allSelected}
        onClick={onToggleAll}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded border",
          allSelected
            ? "border-[color:var(--xyra-purple)] bg-[color:var(--xyra-purple)]"
            : "border-white/30 bg-black/30",
        )}
        aria-label={allSelected ? "Deselect all" : "Select all"}
        title={allSelected ? "Deselect all" : "Select all"}
      >
        {allSelected && <Check className="size-3 text-white" />}
      </button>

      <span className="text-xs text-white/80">
        {selectedIds.length} of {totalVisible} selected
      </span>

      <div className="ml-auto flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              className="h-7 gap-1 px-2 text-xs text-white/80 hover:text-white"
            >
              <UserPlus className="size-3.5" />
              Assign
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs">Assign to</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => bulkAssign(null)}>
              Unassigned
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {members.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-white/40">
                No team members yet.
              </DropdownMenuItem>
            ) : (
              members.map((m) => {
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
                    onClick={() => bulkAssign(m.id)}
                    className="flex items-center gap-2"
                  >
                    <Avatar className="size-5">
                      {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
                      <AvatarFallback className="text-[9px]">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{m.full_name ?? m.email}</span>
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={bulkClose}
          className="h-7 gap-1 px-2 text-xs text-white/80 hover:text-white"
        >
          <CheckCircle className="size-3.5" /> Close
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
          className="h-7 gap-1 px-2 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200"
        >
          <Trash2 className="size-3.5" /> Delete
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="size-7 text-white/60 hover:text-white"
          aria-label="Clear selection"
          title="Clear selection (Esc)"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="border-white/10">
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.length} conversation{selectedIds.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              They'll be soft-deleted — hidden from your inbox but preserved in the
              database for audit. We don't have an undo UI yet (Week N polish).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={bulkDelete}
              disabled={pending}
              className="bg-red-500 text-white hover:bg-red-500/90 border-0"
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
