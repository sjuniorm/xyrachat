import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { InboxStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { supabase } from "../lib/supabase";
import { sendMessage } from "../lib/api";
import { useThread } from "../hooks/useThread";
import { useAuth } from "../auth/AuthContext";
import { MessageBubble } from "../components/MessageBubble";
import { contactDisplayName, channelLabel } from "../lib/format";
import type { ConversationWithRelations } from "../types";

type Props = NativeStackScreenProps<InboxStackParamList, "ChatDetail">;

const CONV_SELECT = `
  *,
  contact:contacts!conversations_contact_id_fkey(*),
  channel:channels!conversations_channel_id_fkey(id, type, name)
`;

export function ChatDetailScreen({ route, navigation }: Props) {
  const { conversationId } = route.params;
  const { messages, loading } = useThread(conversationId);
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [conv, setConv] = useState<ConversationWithRelations | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const loadConv = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select(CONV_SELECT)
      .eq("id", conversationId)
      .maybeSingle();
    setConv((data as ConversationWithRelations | null) ?? null);
  }, [conversationId]);

  useEffect(() => {
    void loadConv();
  }, [loadConv]);

  useEffect(() => {
    const channel = supabase
      .channel(`rt-conv-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        () => void loadConv(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, loadConv]);

  useEffect(() => {
    navigation.setOptions({
      title: conv ? contactDisplayName(conv.contact) : "",
    });
  }, [navigation, conv]);

  // Inverted list wants newest-first.
  const inverted = useMemo(() => [...messages].reverse(), [messages]);

  const assignedToMe = conv?.assigned_to === userId;
  const closed = conv?.status === "closed";
  const canSend = Boolean(conv?.channel) && text.trim().length > 0 && !sending;

  const onSend = async () => {
    const body = text.trim();
    if (!body || !conv?.channel) return;
    setSending(true);
    const result = await sendMessage({
      channelType: conv.channel.type,
      conversationId,
      content: body,
    });
    setSending(false);
    if (result.ok) {
      setText("");
    } else {
      Alert.alert("Couldn't send", result.error);
    }
  };

  const assignToMe = async () => {
    if (!userId) return;
    await supabase
      .from("conversations")
      .update({ assigned_to: userId })
      .eq("id", conversationId);
    void loadConv();
  };

  const toggleClose = async () => {
    const next = closed ? "open" : "closed";
    await supabase
      .from("conversations")
      .update({ status: next })
      .eq("id", conversationId);
    void loadConv();
  };

  const onAttach = () =>
    Alert.alert(
      "Coming soon",
      "Sending photos & files from mobile lands with media outbound. For now you can reply with text.",
    );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 92 : 0}
      >
        {/* Action sub-bar */}
        <View style={styles.actionBar}>
          <Pressable
            style={styles.contactInfo}
            onPress={() =>
              conv?.contact &&
              navigation.navigate("ContactProfile", {
                contactId: conv.contact.id,
              })
            }
          >
            <Text style={styles.channelLabel}>
              {channelLabel(conv?.channel?.type)}
              {closed ? " · Closed" : ""}
            </Text>
          </Pressable>
          <View style={styles.actions}>
            {!assignedToMe ? (
              <Pressable style={styles.actionBtn} onPress={assignToMe}>
                <MaterialCommunityIcons
                  name="account-arrow-down"
                  size={15}
                  color={colors.glow}
                />
                <Text style={styles.actionText}>Assign to me</Text>
              </Pressable>
            ) : (
              <View style={[styles.actionBtn, styles.actionBtnGhost]}>
                <MaterialCommunityIcons
                  name="account-check"
                  size={15}
                  color={colors.online}
                />
                <Text style={[styles.actionText, { color: colors.online }]}>
                  Yours
                </Text>
              </View>
            )}
            <Pressable style={styles.actionBtn} onPress={toggleClose}>
              <MaterialCommunityIcons
                name={closed ? "lock-open-variant" : "check-circle-outline"}
                size={15}
                color={colors.glow}
              />
              <Text style={styles.actionText}>
                {closed ? "Reopen" : "Close"}
              </Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.glow} />
          </View>
        ) : (
          <FlatList
            data={inverted}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} onImagePress={setPreviewUri} />
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyThread}>
                <Text style={styles.emptyText}>No messages yet</Text>
              </View>
            }
          />
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <Pressable onPress={onAttach} hitSlop={8} style={styles.iconBtn}>
            <MaterialCommunityIcons
              name="paperclip"
              size={22}
              color={colors.textMuted}
            />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={
              conv?.channel ? "Type a message…" : "Channel unavailable"
            }
            placeholderTextColor={colors.textFaint}
            editable={Boolean(conv?.channel)}
            multiline
            style={styles.input}
          />
          <Pressable
            onPress={onSend}
            disabled={!canSend}
            style={[styles.sendBtn, { opacity: canSend ? 1 : 0.4 }]}
          >
            {sending ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <MaterialCommunityIcons name="send" size={20} color={colors.white} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Full-screen image preview */}
      <Modal
        visible={Boolean(previewUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <Pressable style={styles.modal} onPress={() => setPreviewUri(null)}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.fullImage}
              contentFit="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  contactInfo: { flexShrink: 1 },
  channelLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  actionBtnGhost: { backgroundColor: "transparent" },
  actionText: { color: colors.glow, fontSize: 12, fontWeight: "600" },
  listContent: { paddingVertical: 10 },
  emptyThread: {
    transform: [{ scaleY: -1 }],
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: { color: colors.textFaint, fontSize: 14 },
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
  iconBtn: { padding: 8 },
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
  modal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: { width: "100%", height: "80%" },
});
