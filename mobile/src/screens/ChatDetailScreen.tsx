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
import { useHeaderHeight } from "@react-navigation/elements";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { InboxStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { supabase } from "../lib/supabase";
import { sendMessage, aiAssist, aiSuggestReply } from "../lib/api";
import { useThread } from "../hooks/useThread";
import { useAuth } from "../auth/AuthContext";
import { MessageBubble } from "../components/MessageBubble";
import { TemplatePicker } from "../components/TemplatePicker";
import { contactDisplayName, channelLabel } from "../lib/format";
import { mediaImageSource } from "../lib/media";
import type { ConversationWithRelations } from "../types";

type Props = NativeStackScreenProps<InboxStackParamList, "ChatDetail">;

const CONV_SELECT = `
  *,
  contact:contacts!conversations_contact_id_fkey(*),
  channel:channels!conversations_channel_id_fkey(id, type, name)
`;

const AI_ACTIONS: { key: string; label: string; icon: string }[] = [
  { key: "improve", label: "Improve writing", icon: "auto-fix" },
  { key: "friendlier", label: "Make friendlier", icon: "emoticon-happy-outline" },
  { key: "professional", label: "More professional", icon: "tie" },
  { key: "shorter", label: "Make shorter", icon: "format-letter-spacing" },
  { key: "fix_grammar", label: "Fix grammar & spelling", icon: "spellcheck" },
];

export function ChatDetailScreen({ route, navigation }: Props) {
  const { conversationId } = route.params;
  const { messages, loading } = useThread(conversationId);
  const { session } = useAuth();
  const userId = session?.user?.id;
  const headerHeight = useHeaderHeight();

  const [conv, setConv] = useState<ConversationWithRelations | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

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
  const isWhatsApp = conv?.channel?.type === "whatsapp";
  const canSend =
    text.trim().length > 0 && !sending && (noteMode || Boolean(conv?.channel));

  const onSend = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);

    if (noteMode) {
      // Internal note — stored locally only, never sent to the customer.
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        direction: "outbound",
        content: body,
        sender_type: "agent",
        sender_id: userId,
        status: "sent",
        is_internal_note: true,
      });
      setSending(false);
      if (error) Alert.alert("Couldn't save note", error.message);
      else setText("");
      return;
    }

    if (!conv?.channel) {
      setSending(false);
      return;
    }
    const result = await sendMessage({
      channelType: conv.channel.type,
      conversationId,
      content: body,
    });
    setSending(false);
    if (result.ok) setText("");
    else Alert.alert("Couldn't send", result.error);
  };

  const runAssist = async (action: string) => {
    const body = text.trim();
    if (!body) {
      Alert.alert("Nothing to rewrite", "Type a message first, then use AI.");
      return;
    }
    setAiOpen(false);
    setAiBusy(true);
    const result = await aiAssist({ text: body, action, conversationId });
    setAiBusy(false);
    if (result.ok) setText(result.text);
    else Alert.alert("AI Assist", result.error);
  };

  const runSuggest = async () => {
    setAiBusy(true);
    const result = await aiSuggestReply(conversationId);
    setAiBusy(false);
    if (!result.ok) {
      Alert.alert("Suggest reply", result.error);
      return;
    }
    if (result.noGroundedAnswer || !result.text.trim()) {
      Alert.alert(
        "Suggest reply",
        "No grounded answer in the knowledge base — reply manually or hand off to keep it accurate.",
      );
      return;
    }
    setText(result.text);
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
        keyboardVerticalOffset={headerHeight}
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
            keyboardDismissMode="interactive"
            ListEmptyComponent={
              <View style={styles.emptyThread}>
                <Text style={styles.emptyText}>No messages yet</Text>
              </View>
            }
          />
        )}

        {/* Composer */}
        <View>
          {/* Reply/Note toggle + AI actions */}
          <View style={styles.aiBar}>
            <View style={styles.modeToggle}>
              <Pressable
                onPress={() => setNoteMode(false)}
                style={[styles.modePill, !noteMode && styles.modePillActive]}
              >
                <Text
                  style={[styles.modeText, !noteMode && styles.modeTextActive]}
                >
                  Reply
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setNoteMode(true)}
                style={[styles.modePill, noteMode && styles.modePillActiveNote]}
              >
                <Text
                  style={[styles.modeText, noteMode && styles.modeTextActive]}
                >
                  Note
                </Text>
              </Pressable>
            </View>

            {!noteMode ? (
              <View style={styles.aiActions}>
                {aiBusy ? (
                  <ActivityIndicator color={colors.glow} size="small" />
                ) : (
                  <>
                    <Pressable
                      style={styles.aiBtn}
                      onPress={() => setAiOpen(true)}
                    >
                      <MaterialCommunityIcons
                        name="auto-fix"
                        size={15}
                        color={colors.glow}
                      />
                      <Text style={styles.aiBtnText}>AI</Text>
                    </Pressable>
                    <Pressable style={styles.aiBtn} onPress={runSuggest}>
                      <MaterialCommunityIcons
                        name="lightbulb-outline"
                        size={15}
                        color={colors.glow}
                      />
                      <Text style={styles.aiBtnText}>Suggest</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : (
              <Text style={styles.noteHint}>Visible to your team only</Text>
            )}
          </View>

          <View style={[styles.composer, noteMode && styles.composerNote]}>
            <Pressable onPress={onAttach} hitSlop={8} style={styles.iconBtn}>
              <MaterialCommunityIcons
                name="paperclip"
                size={22}
                color={colors.textMuted}
              />
            </Pressable>
            {isWhatsApp && !noteMode ? (
              <Pressable
                onPress={() => setTemplateOpen(true)}
                hitSlop={8}
                style={styles.iconBtn}
              >
                <MaterialCommunityIcons
                  name="file-document-outline"
                  size={22}
                  color={colors.textMuted}
                />
              </Pressable>
            ) : null}
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={
                noteMode
                  ? "Write an internal note…"
                  : conv?.channel
                    ? "Type a message…"
                    : "Channel unavailable"
              }
              placeholderTextColor={colors.textFaint}
              editable={noteMode || Boolean(conv?.channel)}
              multiline
              style={[styles.input, noteMode && styles.inputNote]}
            />
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={[
                styles.sendBtn,
                noteMode && styles.sendBtnNote,
                { opacity: canSend ? 1 : 0.4 },
              ]}
            >
              {sending ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <MaterialCommunityIcons
                  name={noteMode ? "note-plus-outline" : "send"}
                  size={20}
                  color={colors.white}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* WhatsApp template picker */}
      {conv?.channel ? (
        <TemplatePicker
          visible={templateOpen}
          channelId={conv.channel.id}
          conversationId={conversationId}
          contactName={contactDisplayName(conv.contact)}
          onClose={() => setTemplateOpen(false)}
        />
      ) : null}

      {/* AI actions sheet */}
      <Modal
        visible={aiOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAiOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setAiOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>AI Assist</Text>
            {AI_ACTIONS.map((a) => (
              <Pressable
                key={a.key}
                style={styles.sheetRow}
                onPress={() => runAssist(a.key)}
              >
                <MaterialCommunityIcons
                  name={
                    a.icon as React.ComponentProps<
                      typeof MaterialCommunityIcons
                    >["name"]
                  }
                  size={20}
                  color={colors.glow}
                />
                <Text style={styles.sheetRowText}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

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
              source={mediaImageSource(previewUri, session?.access_token)}
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
  aiBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 2,
    backgroundColor: colors.surface,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 2,
  },
  modePill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
  },
  modePillActive: { backgroundColor: colors.purple },
  modePillActiveNote: { backgroundColor: colors.away },
  modeText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  modeTextActive: { color: colors.white },
  aiActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiBtnText: { color: colors.glow, fontSize: 12, fontWeight: "700" },
  noteHint: { color: colors.away, fontSize: 12, fontStyle: "italic" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: colors.surface,
  },
  composerNote: { backgroundColor: "rgba(245,158,11,0.08)" },
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
  inputNote: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnNote: { backgroundColor: colors.away },
  modal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: { width: "100%", height: "80%" },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    paddingBottom: 34,
    paddingHorizontal: 8,
  },
  sheetTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
  },
  sheetRowText: { color: colors.text, fontSize: 16 },
});
