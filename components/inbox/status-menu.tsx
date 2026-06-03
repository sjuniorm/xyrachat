"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckCircle,
  ChevronRight,
  Clock,
  MoreVertical,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  setConversationStatus,
  snoozeConversation,
} from "@/lib/inbox/actions";
import type { ConversationStatus } from "@/lib/db-types";

const SNOOZE_PRESETS = [
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "tomorrow", label: "Tomorrow 9 AM" },
  { value: "next_week", label: "Next week" },
] as const;

export function StatusMenu({
  conversationId,
  status,
}: {
  conversationId: string;
  status: ConversationStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function applyStatus(next: ConversationStatus) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("conversation_id", conversationId);
      fd.set("status", next);
      const r = await setConversationStatus(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        next === "closed"
          ? "Conversation closed"
          : next === "open"
            ? "Conversation reopened"
            : next === "bot"
              ? "Transferred to bot"
              : "Status updated",
      );
      router.refresh();
    });
  }

  function snooze(preset: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("conversation_id", conversationId);
      fd.set("preset", preset);
      const r = await snoozeConversation(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Snoozed");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="More"
          disabled={pending}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">Conversation</DropdownMenuLabel>

        {status === "closed" ? (
          <DropdownMenuItem onClick={() => applyStatus("open")}>
            <RotateCcw className="mr-2 size-4" />
            Reopen
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => applyStatus("closed")}>
            <CheckCircle className="mr-2 size-4" />
            Close conversation
          </DropdownMenuItem>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            <Clock className="mr-2 size-4" />
            Snooze
            <ChevronRight className="ml-auto size-3.5 text-white/50" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {SNOOZE_PRESETS.map((p) => (
              <DropdownMenuItem
                key={p.value}
                onClick={() => snooze(p.value)}
              >
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {status !== "bot" && (
          <DropdownMenuItem onClick={() => applyStatus("bot")}>
            <Bot className="mr-2 size-4" />
            Transfer to bot
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => toast.message("Mark unread coming soon")}
          className="text-white/60"
        >
          Mark as unread
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
