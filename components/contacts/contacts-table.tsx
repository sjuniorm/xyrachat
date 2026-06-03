"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, ChevronRight, X } from "lucide-react";
import { ChannelIcon } from "@/components/ui/channel-icon";
import type { Channel } from "@/lib/mock-data";

export type ContactRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  instagram_id: string | null;
  telegram_id: string | null;
  tags: string[];
  created_at: string;
  conversationId: string | null;
  channelType: string | null;
  lastActivity: string | null;
};

function displayName(c: ContactRow) {
  return c.name || c.phone || c.email || c.instagram_id || c.telegram_id || "Unknown";
}
function identifier(c: ContactRow) {
  return c.phone || c.email || c.instagram_id || c.telegram_id || "";
}
function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const allTags = useMemo(
    () => Array.from(new Set(contacts.flatMap((c) => c.tags))).sort(),
    [contacts],
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (tag && !c.tags.includes(tag)) return false;
      if (!qq) return true;
      return [c.name, c.phone, c.email, c.instagram_id, c.telegram_id].some((v) =>
        v?.toLowerCase().includes(qq),
      );
    });
  }, [contacts, q, tag]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-white/10 px-6 py-4">
        <h1 className="text-lg font-semibold text-white">
          Contacts{" "}
          <span className="text-sm font-normal text-white/40">
            ({contacts.length})
          </span>
        </h1>
        <p className="text-sm text-white/50">
          Everyone who&apos;s ever messaged your workspace.
        </p>
      </header>

      {/* Search + tag filter */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-6 py-3">
        <div className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3">
          <Search className="size-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, email, handle…"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {allTags.slice(0, 12).map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  tag === t
                    ? "bg-[#9333EA] text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {t}
              </button>
            ))}
            {tag && (
              <button
                onClick={() => setTag(null)}
                className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs text-white/50 hover:text-white"
              >
                <X className="size-3" /> clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
            <Users className="size-10 text-white/30" />
            <p className="text-sm text-white/50">
              {contacts.length === 0
                ? "No contacts yet — they appear here once people message your channels."
                : "No contacts match your search."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {filtered.map((c) => {
              const name = displayName(c);
              const Row = (
                <div className="flex items-center gap-3 px-6 py-3 transition hover:bg-white/5">
                  {c.channelType ? (
                    <ChannelIcon channel={c.channelType as Channel} size="md" />
                  ) : (
                    <span className="flex size-8 items-center justify-center rounded-full bg-[#9333EA] text-xs font-bold text-white">
                      {initials(name)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{name}</p>
                    {identifier(c) && (
                      <p className="truncate text-xs text-white/50">{identifier(c)}</p>
                    )}
                  </div>
                  <div className="hidden max-w-[40%] flex-wrap justify-end gap-1 sm:flex">
                    {c.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[#D882FF]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs text-white/40">
                    {timeAgo(c.lastActivity)}
                  </span>
                  {c.conversationId && (
                    <ChevronRight className="size-4 shrink-0 text-white/30" />
                  )}
                </div>
              );
              return (
                <li key={c.id}>
                  {c.conversationId ? (
                    <Link href={`/inbox/${c.conversationId}`}>{Row}</Link>
                  ) : (
                    Row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
