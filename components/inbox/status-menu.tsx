"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  BotMessageSquare,
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  setConversationStatus,
  snoozeConversation,
  markConversationUnread,
  setConversationBotOnly,
  setConversationBotOverride,
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
  bots,
  botOnly,
  botIdOverride,
}: {
  conversationId: string;
  status: ConversationStatus;
  bots: Array<{ id: string; name: string }>;
  botOnly: boolean;
  botIdOverride: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleBotOnly(value: boolean) {
    startTransition(async () => {
      const r = await setConversationBotOnly(conversationId, value);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(value ? "Bot-only mode on" : "Bot-only mode off");
      router.refresh();
    });
  }

  function chooseBot(value: string) {
    const botId = value === "__auto__" ? null : value;
    startTransition(async () => {
      const r = await setConversationBotOverride(conversationId, botId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        botId
          ? `Pinned ${bots.find((b) => b.id === botId)?.name ?? "bot"}`
          : "Bot routing set to automatic",
      );
      router.refresh();
    });
  }

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
        <DropdownMenuLabel className="text-xs">Bot</DropdownMenuLabel>

        <DropdownMenuCheckboxItem
          checked={botOnly}
          onCheckedChange={(v) => toggleBotOnly(Boolean(v))}
          disabled={pending}
        >
          Bot-only mode
        </DropdownMenuCheckboxItem>

        {bots.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <BotMessageSquare className="mr-2 size-4" />
              Use bot
              <ChevronRight className="ml-auto size-3.5 text-white/50" />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              <DropdownMenuRadioGroup
                value={botIdOverride ?? "__auto__"}
                onValueChange={chooseBot}
              >
                <DropdownMenuRadioItem value="__auto__">
                  Automatic (route by channel)
                </DropdownMenuRadioItem>
                {bots.map((b) => (
                  <DropdownMenuRadioItem key={b.id} value={b.id}>
                    <span className="truncate">{b.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            startTransition(async () => {
              const r = await markConversationUnread(conversationId);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success("Marked as unread");
              router.refresh();
            })
          }
        >
          Mark as unread
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
