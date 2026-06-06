"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Sender = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type TeamMessage = {
  id: string;
  org_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender: Sender | null;
};

const SELECT =
  "id, org_id, sender_id, body, created_at, sender:profiles!team_messages_sender_id_fkey(id, full_name, avatar_url)";

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TeamChatClient() {
  const [supabase] = useState(() => createClient());
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [members, setMembers] = useState<Record<string, Sender>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active || !user) return;
      setUserId(user.id);

      const { data: me } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();
      setOrgId((me as { org_id: string | null } | null)?.org_id ?? null);

      const { data: mem } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url");
      const map: Record<string, Sender> = {};
      for (const m of (mem as Sender[] | null) ?? []) map[m.id] = m;
      setMembers(map);

      const { data, error } = await supabase
        .from("team_messages")
        .select(SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!active) return;
      setLoadError(Boolean(error));
      setMessages((data as TeamMessage[] | null) ?? []);
      setLoading(false);
      scrollToBottom();
    })();
    return () => {
      active = false;
    };
  }, [supabase, scrollToBottom]);

  useEffect(() => {
    const channel = supabase
      .channel("rt-team-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages" },
        (payload) => {
          const row = payload.new as Omit<TeamMessage, "sender">;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [...prev, { ...row, sender: members[row.sender_id] ?? null }],
          );
          scrollToBottom();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, members, scrollToBottom]);

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || !userId || !orgId || sending) return;
    setSending(true);
    setText("");
    const { error } = await supabase
      .from("team_messages")
      .insert({ org_id: orgId, sender_id: userId, body });
    setSending(false);
    if (error) setText(body); // restore on failure
  }, [text, userId, orgId, sending, supabase]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/10 px-6 py-4">
        <h1 className="text-lg font-semibold text-white">Team chat</h1>
        <p className="text-sm text-white/50">
          Private to your workspace — talk to your teammates here.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-white/40">Loading…</p>
        ) : loadError ? (
          <p className="py-10 text-center text-sm text-rose-300">
            Couldn&apos;t load team chat. Refresh to try again.
          </p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/40">
            No messages yet. Say hi to your team 👋
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              const mine = m.sender_id === userId;
              const name = m.sender?.full_name || "Teammate";
              return (
                <div
                  key={m.id}
                  className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#9333EA] text-xs font-bold text-white">
                    {initials(name)}
                  </div>
                  <div
                    className={`max-w-[70%] rounded-2xl px-3 py-2 ${
                      mine
                        ? "rounded-tr-sm bg-[#7C2BD6] text-white"
                        : "rounded-tl-sm bg-[#241338] text-white"
                    }`}
                  >
                    {!mine && (
                      <p className="mb-0.5 text-xs font-semibold text-[#D882FF]">
                        {name}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {m.body}
                    </p>
                    <p className="mt-1 text-right text-[10px] text-white/50">
                      {clock(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Message your team…"
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-[#1F1033] px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#D882FF] focus:outline-none"
          />
          <button
            onClick={() => void send()}
            disabled={!text.trim() || sending}
            className="rounded-xl bg-gradient-to-br from-[#9333EA] to-[#EC4899] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
