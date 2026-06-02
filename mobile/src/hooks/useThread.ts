import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { uid } from "../lib/uid";
import type { Message } from "../types";

/**
 * Messages for one conversation, oldest→newest, with a live subscription that
 * appends new rows (inbound, our own outbound echoed back, and bot replies).
 */
export function useThread(conversationId: string) {
  const chanId = useRef(uid()).current;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select(
        "id, conversation_id, direction, content, media_url, media_type, sender_type, sender_id, status, is_internal_note, created_at",
      )
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    setMessages((data as Message[] | null) ?? []);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`rt-thread-${conversationId}-${chanId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
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
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return { messages, loading, reload: load };
}
