import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme";
import { supabase } from "../lib/supabase";
import { sendTemplate } from "../lib/api";
import {
  templateBody,
  countVariables,
  applyVariables,
  buildSendComponents,
  type WaTemplate,
} from "../lib/templates";

export function TemplatePicker({
  visible,
  channelId,
  conversationId,
  contactName,
  onClose,
}: {
  visible: boolean;
  channelId: string;
  conversationId: string;
  contactName: string;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WaTemplate | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSelected(null);
    void supabase
      .from("wa_templates")
      .select("id, name, language, category, components, meta_status")
      .eq("channel_id", channelId)
      .eq("meta_status", "APPROVED")
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        setTemplates((data as WaTemplate[] | null) ?? []);
        setLoading(false);
      });
  }, [visible, channelId]);

  const doSend = async (t: WaTemplate, vals: string[]) => {
    setSending(true);
    const res = await sendTemplate({
      conversationId,
      templateName: t.name,
      templateLanguage: t.language,
      components: buildSendComponents(vals),
    });
    setSending(false);
    if (res.ok) onClose();
    else Alert.alert("Couldn't send template", res.error);
  };

  const onPick = (t: WaTemplate) => {
    const n = countVariables(templateBody(t));
    if (n === 0) {
      void doSend(t, []);
      return;
    }
    setSelected(t);
    setValues(Array.from({ length: n }, (_, i) => (i === 0 ? contactName : "")));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            {selected ? (
              <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={24}
                  color={colors.glow}
                />
              </Pressable>
            ) : (
              <View style={{ width: 24 }} />
            )}
            <Text style={styles.title}>
              {selected ? selected.name : "WhatsApp templates"}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialCommunityIcons
                name="close"
                size={22}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          {/* Variable-fill step */}
          {selected ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <View style={styles.previewCard}>
                <Text style={styles.previewText}>
                  {applyVariables(templateBody(selected), values)}
                </Text>
              </View>
              {values.map((v, i) => (
                <View key={i} style={{ gap: 4 }}>
                  <Text style={styles.varLabel}>Variable {`{{${i + 1}}}`}</Text>
                  <TextInput
                    value={v}
                    onChangeText={(t) =>
                      setValues((prev) => prev.map((x, j) => (j === i ? t : x)))
                    }
                    placeholder={i === 0 ? "Contact name" : `Value ${i + 1}`}
                    placeholderTextColor={colors.textFaint}
                    style={styles.input}
                  />
                </View>
              ))}
              <Pressable
                style={[styles.sendBtn, sending && { opacity: 0.6 }]}
                disabled={sending}
                onPress={() => doSend(selected, values)}
              >
                {sending ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.sendText}>Send template</Text>
                )}
              </Pressable>
            </ScrollView>
          ) : loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.glow} />
            </View>
          ) : templates.length === 0 ? (
            <View style={styles.center}>
              <MaterialCommunityIcons
                name="file-document-outline"
                size={40}
                color={colors.textFaint}
              />
              <Text style={styles.emptyText}>
                No approved templates for this channel. Create and submit them
                on the Xyra Chat web app.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {sending ? (
                <View style={styles.center}>
                  <ActivityIndicator color={colors.glow} />
                </View>
              ) : null}
              {templates.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.row}
                  onPress={() => onPick(t)}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowName}>{t.name}</Text>
                      <Text style={styles.rowLang}>{t.language}</Text>
                    </View>
                    <Text style={styles.rowBody} numberOfLines={2}>
                      {templateBody(t)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={colors.textFaint}
                  />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "78%",
    minHeight: "45%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  center: { alignItems: "center", justifyContent: "center", padding: 40, gap: 12, flex: 1 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  rowLang: { color: colors.textFaint, fontSize: 11 },
  rowBody: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  previewCard: {
    backgroundColor: colors.bubbleIn,
    borderRadius: 14,
    padding: 12,
  },
  previewText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  varLabel: { color: colors.textMuted, fontSize: 12 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: colors.purple,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  sendText: { color: colors.white, fontSize: 16, fontWeight: "700" },
});
