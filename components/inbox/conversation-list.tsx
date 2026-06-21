"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  ChevronDown,
  Clock,
  Filter,
  MailPlus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConversationItem } from "@/components/inbox/conversation-item";
import { BulkActionsBar } from "@/components/inbox/bulk-actions-bar";
import { ChannelIcon, channelLabel } from "@/components/ui/channel-icon";
import type {
  Channel,
  Conversation,
  ConversationFilter,
} from "@/lib/mock-data";
import type { TeamMember } from "@/lib/team/server";

const TABS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "unassigned", label: "Unassigned" },
  { value: "bot", label: "Bot" },
  { value: "closed", label: "Closed" },
];

type SortKey = "last_activity" | "newest" | "oldest";
const ALL_CHANNELS: Channel[] = [
  "whatsapp",
  "instagram",
  "telegram",
  "email",
  "facebook",
  "webchat",
];

export function ConversationList({
  conversations,
  currentUserId,
  members,
}: {
  conversations: Conversation[];
  currentUserId: string;
  members: TeamMember[];
}) {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const activeId = params?.id;

  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<Set<Channel>>(
    new Set(ALL_CHANNELS),
  );
  const [sortKey, setSortKey] = useState<SortKey>("last_activity");
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    const filtered = conversations.filter((c) => {
      if (filter === "closed" && c.status !== "closed") return false;
      if (filter === "bot" && c.status !== "bot") return false;
      if (filter === "mine" && c.assigned_agent?.id !== currentUserId) return false;
      if (filter === "unassigned" && c.assigned_agent) return false;
      if (!channelFilter.has(c.channel)) return false;
      if (!q) return true;
      return (
        c.contact.name.toLowerCase().includes(q) ||
        (c.last_message_preview ?? "").toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "newest":
          return (
            new Date(b.created_at ?? b.last_message_at).getTime() -
            new Date(a.created_at ?? a.last_message_at).getTime()
          );
        case "oldest":
          return (
            new Date(a.created_at ?? a.last_message_at).getTime() -
            new Date(b.created_at ?? b.last_message_at).getTime()
          );
        case "last_activity":
        default:
          return (
            new Date(b.last_message_at).getTime() -
            new Date(a.last_message_at).getTime()
          );
      }
    });
    return sorted;
  }, [conversations, filter, search, currentUserId, channelFilter, sortKey]);

  // Drop any selections that have filtered out — prevents acting on hidden rows.
  useEffect(() => {
    setSelected((prev) => {
      const visibleIds = new Set(visible.map((c) => c.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visible]);

  function toggleSelected(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === visible.length) return new Set();
      return new Set(visible.map((c) => c.id));
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  const channelLabelText =
    channelFilter.size === ALL_CHANNELS.length
      ? "All channels"
      : `${channelFilter.size} channel${channelFilter.size === 1 ? "" : "s"}`;

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

      {/* Filter tabs */}
      <div className="border-b border-white/5 p-2">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as ConversationFilter)}
        >
          <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-transparent p-0">
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

      {/* Channel + sort dropdowns */}
      <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-white/70 hover:text-white"
            >
              <Filter className="size-3" />
              {channelLabelText}
              <ChevronDown className="size-3 text-white/50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs">Channels</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_CHANNELS.map((ch) => (
              <DropdownMenuCheckboxItem
                key={ch}
                checked={channelFilter.has(ch)}
                onCheckedChange={(checked) => {
                  setChannelFilter((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(ch);
                    else next.delete(ch);
                    return next;
                  });
                }}
                onSelect={(e) => e.preventDefault()}
              >
                <span className="flex items-center gap-2">
                  <ChannelIcon channel={ch} size="sm" withRing={false} />
                  {channelLabel(ch)}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 gap-1.5 px-2 text-xs text-white/70 hover:text-white"
            >
              {sortKey === "newest" ? (
                <ArrowDownNarrowWide className="size-3" />
              ) : sortKey === "oldest" ? (
                <ArrowUpNarrowWide className="size-3" />
              ) : (
                <Clock className="size-3" />
              )}
              {sortKey === "newest"
                ? "Newest first"
                : sortKey === "oldest"
                  ? "Oldest first"
                  : "Last activity"}
              <ChevronDown className="size-3 text-white/50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sortKey}
              onValueChange={(v) => setSortKey(v as SortKey)}
            >
              <DropdownMenuRadioItem value="last_activity">
                Last activity
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="newest">
                Newest first
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="oldest">
                Oldest first
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Bulk actions bar — replaces the list header when ≥1 selected */}
      {selected.size > 0 && (
        <BulkActionsBar
          selectedIds={Array.from(selected)}
          totalVisible={visible.length}
          allSelected={selected.size === visible.length}
          onToggleAll={toggleAll}
          onClear={clearSelection}
          members={members}
          onActionDone={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}

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
              selectionEnabled={selected.size > 0}
              selected={selected.has(c.id)}
              onToggleSelect={toggleSelected}
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
        Connect a WhatsApp or Instagram channel and customer messages will appear here in real time.
      </p>
      <Button
        asChild
        size="sm"
        className="mt-1 h-8 xyra-gradient border-0 text-white hover:opacity-90"
      >
        <Link href="/settings/channels">Connect a channel</Link>
      </Button>
    </div>
  );
}
