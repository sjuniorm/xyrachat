"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MailPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationItem } from "@/components/inbox/conversation-item";
import type { Conversation, ConversationFilter } from "@/lib/mock-data";

const TABS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "mine", label: "Mine" },
  { value: "bot", label: "Bot" },
];

export function ConversationList({
  conversations,
  currentAgentId,
}: {
  conversations: Conversation[];
  currentAgentId?: string;
}) {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K → focus search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible: Conversation[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "open" && c.status !== "open") return false;
      if (filter === "closed" && c.status !== "closed") return false;
      if (filter === "bot" && c.status !== "bot") return false;
      if (filter === "mine") {
        if (!currentAgentId) return false;
        if (c.assigned_agent?.id !== currentAgentId) return false;
      }
      if (!q) return true;
      return (
        c.contact.name.toLowerCase().includes(q) ||
        (c.last_message_preview ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, filter, search, currentAgentId]);

  return (
    <div
      className="flex h-full w-full flex-col border-r border-white/5"
      style={{ background: "color-mix(in oklab, var(--xyra-sidebar) 92%, black)" }}
    >
      <div className="border-b border-white/5 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/40 focus-visible:border-[color:var(--xyra-glow)]"
            aria-label="Search conversations"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-white/50 md:inline">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="border-b border-white/5 p-2">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as ConversationFilter)}
        >
          <TabsList className="w-full justify-start gap-1 bg-transparent p-0">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="h-7 rounded-md border border-transparent px-2.5 text-xs text-white/60 data-[state=active]:border-white/10 data-[state=active]:bg-white/10 data-[state=active]:text-white"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <EmptyInboxState />
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-white/50">
            No conversations match.
          </p>
        ) : (
          visible.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              active={c.id === activeId}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyInboxState() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <div className="inline-flex size-12 items-center justify-center rounded-full xyra-gradient">
        <MailPlus className="size-5 text-white" />
      </div>
      <p className="text-sm font-medium text-white">No conversations yet</p>
      <p className="max-w-[220px] text-xs text-white/60">
        Connect a WhatsApp channel and customer messages will appear here in real time.
      </p>
      <Button
        asChild
        size="sm"
        className="mt-1 h-8 xyra-gradient border-0 text-white hover:opacity-90"
      >
        <Link href="/settings/channels/new">Connect WhatsApp</Link>
      </Button>
    </div>
  );
}
