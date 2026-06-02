import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "../components/Avatar";
import { clockTime } from "../lib/format";
import { uid } from "../lib/uid";

type Sender = { id: string; full_name: string | null; avatar_url: string | null };
type TeamMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender: Sender | null;
};

const SELECT =
  "id, sender_id, body, created_at, sender:profiles!team_messages_sender_id_fkey(id, full_name, avatar_url)";

export function TeamChatScreen() {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  const orgId = profile?.org_id;
  const headerHeight = useHeaderHeight();
  const chanId = useRef(uid()).current;

  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [members, setMembers] = useState<Record<string, Sender>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data: mem } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url");
    const map: Record<string, Sender> = {};
    for (const m of (mem as Sender[] | null) ?? []) map[m.id] = m;
    setMembers(map);

    const { data } = await supabase
      .from("team_messages")
      .select(SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((data as TeamMessage[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`rt-team-chat-${chanId}`)
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
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chanId, members]);

  const inverted = useMemo(() => [...messages].reverse(), [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || !userId || !orgId || sending) return;
    setSending(true);
    setText("");
    const { error } = await supabase
      .from("team_messages")
      .insert({ org_id: orgId, sender_id: userId, body });
    setSending(false);
    if (error) setText(body);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.glow} />
        </View>
      ) : (
        <FlatList
          data={inverted}
          inverted
          keyExtractor={(m) => m.id}
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingVertical: 10 }}
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            const name = item.sender?.full_name || "Teammate";
            return (
              <View
                style={[styles.row, mine ? styles.rowMine : styles.rowOther]}
              >
                {!mine ? (
                  <Avatar uri={item.sender?.avatar_url} name={name} size={32} />
                ) : null}
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleOther,
                  ]}
                >
                  {!mine ? <Text style={styles.senderName}>{name}</Text> : null}
                  <Text style={styles.body}>{item.body}</Text>
                  <Text style={styles.time}>{clockTime(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={[styles.center, { transform: [{ scaleY: -1 }] }]}>
              <Text style={styles.emptyText}>
                No messages yet. Say hi to your team 👋
              </Text>
            </View>
          }
        />
      )}

      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message your team…"
          placeholderTextColor={colors.textFaint}
          multiline
          style={styles.input}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, { opacity: text.trim() && !sending ? 1 : 0.4 }]}
        >
          {sending ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <MaterialCommunityIcons name="send" size={20} color={colors.white} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    marginVertical: 3,
  },
  rowMine: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: colors.bubbleOut, borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.bubbleIn, borderTopLeftRadius: 4 },
  senderName: {
    color: colors.glow,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  body: { color: colors.text, fontSize: 15, lineHeight: 20 },
  time: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    alignSelf: "flex-end",
    marginTop: 2,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.text,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
});
