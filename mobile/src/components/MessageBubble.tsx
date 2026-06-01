import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme";
import { clockTime } from "../lib/format";
import type { Message } from "../types";

function isImage(m: Message): boolean {
  return Boolean(m.media_url && (m.media_type ?? "").toLowerCase().includes("image"));
}

function StatusTick({ status }: { status: Message["status"] }) {
  if (status === "failed") {
    return (
      <MaterialCommunityIcons name="alert-circle" size={13} color={colors.danger} />
    );
  }
  const name = status === "sent" ? "check" : "check-all";
  const color = status === "read" ? colors.glow : "rgba(255,255,255,0.7)";
  return <MaterialCommunityIcons name={name} size={14} color={color} />;
}

export function MessageBubble({
  message,
  onImagePress,
}: {
  message: Message;
  onImagePress?: (uri: string) => void;
}) {
  const outbound = message.direction === "outbound";
  const isBot = message.sender_type === "bot";
  const note = message.is_internal_note;

  if (note) {
    return (
      <View style={[styles.wrap, styles.right]}>
        <View style={[styles.bubble, styles.noteBubble]}>
          <Text style={styles.noteLabel}>🔒 Internal note</Text>
          {message.content ? (
            <Text style={styles.noteText}>{message.content}</Text>
          ) : null}
          <Text style={styles.noteTime}>{clockTime(message.created_at)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, outbound ? styles.right : styles.left]}>
      <View
        style={[
          styles.bubble,
          outbound ? styles.outBubble : styles.inBubble,
          isImage(message) && styles.imageBubble,
        ]}
      >
        {isBot ? <Text style={styles.botTag}>BOT</Text> : null}

        {isImage(message) ? (
          <Pressable onPress={() => onImagePress?.(message.media_url!)}>
            <Image
              source={{ uri: message.media_url! }}
              style={styles.image}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
        ) : null}

        {message.content ? (
          <Text style={[styles.text, outbound && styles.outText]}>
            {message.content}
          </Text>
        ) : !isImage(message) && message.media_type ? (
          <Text style={[styles.text, outbound && styles.outText]}>
            📎 {message.media_type}
          </Text>
        ) : null}

        <View style={styles.meta}>
          <Text
            style={[styles.time, outbound ? styles.outTime : styles.inTime]}
          >
            {clockTime(message.created_at)}
          </Text>
          {outbound ? <StatusTick status={message.status} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, marginVertical: 3, maxWidth: "100%" },
  left: { alignItems: "flex-start" },
  right: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  imageBubble: { padding: 4 },
  inBubble: {
    backgroundColor: colors.bubbleIn,
    borderTopLeftRadius: 4,
  },
  outBubble: {
    backgroundColor: colors.bubbleOut,
    borderTopRightRadius: 4,
  },
  noteBubble: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
    maxWidth: "82%",
  },
  botTag: {
    color: colors.glow,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 2,
  },
  text: { color: colors.text, fontSize: 15, lineHeight: 20 },
  outText: { color: colors.white },
  image: { width: 220, height: 220, borderRadius: 12 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 2,
  },
  time: { fontSize: 10 },
  inTime: { color: colors.textFaint },
  outTime: { color: "rgba(255,255,255,0.7)" },
  noteLabel: { color: colors.away, fontSize: 11, fontWeight: "700" },
  noteText: { color: colors.text, fontSize: 14, lineHeight: 19 },
  noteTime: { color: colors.textFaint, fontSize: 10, alignSelf: "flex-end" },
});
