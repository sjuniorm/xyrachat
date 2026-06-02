import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { messagePreview } from "../lib/format";
import { uid } from "../lib/uid";
import type { ConversationWithRelations } from "../types";

const SELECT = `
  *,
  contact:contacts!conversations_contact_id_fkey(*),
  channel:channels!conversations_channel_id_fkey(id, type, name)
`;

/**
 * All conversations the signed-in agent can see (RLS scopes to their org),
 * newest-activity first, each decorated with a last-message preview. Refreshes
 * live on any conversation change or new message via Realtime.
 */
export function useConversations() {
  const chanId = useRef(uid()).current;
  const [conversations, setConversations] = useState<
    ConversationWithRelations[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const { data: convs } = await supabase
      .from("conversations")
      .select(SELECT)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false })
      .limit(100);

    const rows = (convs as ConversationWithRelations[] | null) ?? [];

    if (rows.length > 0) {
      const ids = rows.map((c) => c.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id, content, media_type, created_at")
        .in("conversation_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);

      const previews: Record<string, string> = {};
      for (const m of (msgs as Array<{
        conversation_id: string;
        content: string | null;
        media_type: string | null;
      }> | null) ?? []) {
        if (!previews[m.conversation_id]) {
          previews[m.conversation_id] = messagePreview(m);
        }
      }
      for (const c of rows) c.last_message_preview = previews[c.id] ?? null;
    }

    setConversations(rows);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`rt-conversations-list-${chanId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  return {
    conversations,
    loading,
    refreshing,
    refresh: () => load(true),
  };
}
