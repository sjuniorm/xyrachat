"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MessageRow } from "@/lib/db-types";

// =====================================================================
// useMessages — keeps a conversation's message list in sync with Supabase
// Realtime. Pass the server-fetched initial array; the hook patches it on
// INSERT/UPDATE events.
// =====================================================================
export function useMessages(
  conversationId: string,
  initial: MessageRow[],
): MessageRow[] {
  const [messages, setMessages] = useState<MessageRow[]>(initial);

  // Reset when the conversation changes (navigation).
  useEffect(() => {
    setMessages(initial);
  }, [conversationId, initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as MessageRow;
          setMessages((prev) =>
            prev.find((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as MessageRow;
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return messages;
}

// =====================================================================
// useInboxRefresh — keeps the inbox in sync via TWO mechanisms:
//   1. Supabase Realtime — instant when it works, but RLS on nested
//      subqueries can drop events silently
//   2. A 5-second polling fallback — bulletproof safety net
// Cheap because RSC re-renders are diff-based and only re-fetch what changed.
// Mounted once at the inbox layout level.
// =====================================================================
const POLL_INTERVAL_MS = 5000;

export function useInboxRefresh() {
  const router = useRouter();

  // 1) Realtime.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("inbox:refresh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // 2) Polling fallback. Pauses while the tab is hidden so we don't burn
  //    background CPU/network on a backgrounded inbox.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (id !== null) return;
      id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    }
    function stop() {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        router.refresh(); // immediate catch-up on tab focus
        start();
      } else {
        stop();
      }
    }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);
}
