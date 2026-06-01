import React from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import { Avatar } from "./Avatar";
import { ChannelBadge } from "./ChannelBadge";
import { colors } from "../theme";
import { contactDisplayName, timeAgo } from "../lib/format";
import type { ConversationStatus, ConversationWithRelations } from "../types";

const STATUS_CHIP: Partial<Record<ConversationStatus, { label: string; color: string }>> = {
  bot: { label: "Bot", color: colors.glow },
  closed: { label: "Closed", color: colors.textFaint },
  snoozed: { label: "Snoozed", color: colors.away },
};

export function ConversationRow({
  item,
  onPress,
}: {
  item: ConversationWithRelations;
  onPress: () => void;
}) {
  const name = contactDisplayName(item.contact);
  const chip = STATUS_CHIP[item.status];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      android_ripple={{ color: colors.surfaceAlt }}
    >
      <Avatar
        uri={item.contact?.avatar_url}
        name={name}
        size={50}
        badge={<ChannelBadge type={item.channel?.type} size={16} />}
      />
      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.time}>{timeAgo(item.last_message_at)}</Text>
        </View>
        <View style={styles.bottomLine}>
          <Text style={styles.preview} numberOfLines={1}>
            {item.last_message_preview || "No messages yet"}
          </Text>
          {chip ? (
            <View style={[styles.chip, { borderColor: chip.color }]}>
              <Text style={[styles.chipText, { color: chip.color }]}>
                {chip.label}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pressed: { backgroundColor: colors.surface },
  body: { flex: 1, gap: 4 },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: { color: colors.text, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  time: { color: colors.textFaint, fontSize: 12 },
  bottomLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  preview: { color: colors.textMuted, fontSize: 13, flex: 1 },
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  chipText: { fontSize: 10, fontWeight: "700" },
});
