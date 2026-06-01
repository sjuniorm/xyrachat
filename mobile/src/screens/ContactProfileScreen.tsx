import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { colors } from "../theme";
import { supabase } from "../lib/supabase";
import { Avatar } from "../components/Avatar";
import { ChannelBadge } from "../components/ChannelBadge";
import { contactDisplayName, channelLabel, timeAgo } from "../lib/format";
import { navigateToConversation } from "../navigation/ref";
import type { Contact, ConversationWithRelations } from "../types";

type ContactProfileRoute = RouteProp<
  { ContactProfile: { contactId: string } },
  "ContactProfile"
>;

const CONV_SELECT = `
  *,
  channel:channels!conversations_channel_id_fkey(id, type, name)
`;

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

export function ContactProfileScreen() {
  const route = useRoute<ContactProfileRoute>();
  const { contactId } = route.params;
  const [contact, setContact] = useState<Contact | null>(null);
  const [conversations, setConversations] = useState<
    ConversationWithRelations[]
  >([]);

  const load = useCallback(async () => {
    const [{ data: c }, { data: convs }] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", contactId).maybeSingle(),
      supabase
        .from("conversations")
        .select(CONV_SELECT)
        .eq("contact_id", contactId)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false }),
    ]);
    setContact((c as Contact | null) ?? null);
    setConversations((convs as ConversationWithRelations[] | null) ?? []);
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!contact) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  const name = contactDisplayName(contact);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.header}>
        <Avatar uri={contact.avatar_url} name={name} size={84} />
        <Text style={styles.name}>{name}</Text>
        {contact.tags && contact.tags.length > 0 ? (
          <View style={styles.tags}>
            {contact.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        {contact.phone ? (
          <DetailRow icon="phone" label="Phone" value={contact.phone} />
        ) : null}
        {contact.email ? (
          <DetailRow icon="email-outline" label="Email" value={contact.email} />
        ) : null}
        {contact.instagram_id ? (
          <DetailRow
            icon="instagram"
            label="Instagram"
            value={contact.instagram_id}
          />
        ) : null}
        {contact.telegram_id ? (
          <DetailRow
            icon="send"
            label="Telegram"
            value={contact.telegram_id}
          />
        ) : null}
        {contact.notes ? (
          <DetailRow
            icon="note-text-outline"
            label="Notes"
            value={contact.notes}
          />
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>
        Conversations ({conversations.length})
      </Text>
      {conversations.map((c) => (
        <Pressable
          key={c.id}
          style={({ pressed }) => [styles.convRow, pressed && styles.pressed]}
          onPress={() => navigateToConversation(c.id)}
        >
          <ChannelBadge type={c.channel?.type} size={18} />
          <View style={{ flex: 1 }}>
            <Text style={styles.convChannel}>
              {channelLabel(c.channel?.type)}
            </Text>
            <Text style={styles.convStatus}>
              {c.status} · {timeAgo(c.last_message_at)}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  muted: { color: colors.textMuted },
  header: { alignItems: "center", paddingVertical: 24, gap: 10 },
  name: { color: colors.text, fontSize: 22, fontWeight: "700" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  tag: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagText: { color: colors.glow, fontSize: 12, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  detailLabel: { color: colors.textFaint, fontSize: 12 },
  detailValue: { color: colors.text, fontSize: 15, marginTop: 1 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
  },
  pressed: { backgroundColor: colors.surface, borderRadius: 12 },
  convChannel: { color: colors.text, fontSize: 15, fontWeight: "600" },
  convStatus: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 1,
    textTransform: "capitalize",
  },
});
