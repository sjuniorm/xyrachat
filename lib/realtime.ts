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
// useInboxRefresh — calls router.refresh() whenever any conversation or
// message in this org changes. Cheap because RSC re-renders are diff-based.
// Mounted once at the inbox layout level.
// =====================================================================
export function useInboxRefresh() {
  const router = useRouter();
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
}
