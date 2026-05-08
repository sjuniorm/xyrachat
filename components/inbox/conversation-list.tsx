"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationItem } from "@/components/inbox/conversation-item";
import {
  CONVERSATIONS,
  type Conversation,
  type ConversationFilter,
} from "@/lib/mock-data";

const TABS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "mine", label: "Mine" },
  { value: "bot", label: "Bot" },
];

export function ConversationList() {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K → focus search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isK = e.key.toLowerCase() === "k";
      if (isK && (e.metaKey || e.ctrlKey)) {
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
    return CONVERSATIONS.filter((c) => {
      if (filter === "open" && c.status !== "open") return false;
      if (filter === "closed" && c.status !== "closed") return false;
      if (filter === "bot" && c.status !== "bot") return false;
      // 'mine' is the demo agent in mock-data
      if (filter === "mine" && c.assigned_agent?.id !== "ag_1") return false;
      if (!q) return true;
      return (
        c.contact.name.toLowerCase().includes(q) ||
        c.last_message_preview.toLowerCase().includes(q)
      );
    }).sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
    );
  }, [filter, search]);

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
        {visible.length === 0 ? (
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
