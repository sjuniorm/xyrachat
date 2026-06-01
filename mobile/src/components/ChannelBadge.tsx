import React from "react";
import { View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { channelColor, colors } from "../theme";
import { CHANNEL_ICON } from "../lib/format";
import type { ChannelType } from "../types";

export function ChannelBadge({
  type,
  size = 18,
}: {
  type?: ChannelType | null;
  size?: number;
}) {
  if (!type) return null;
  const bg = channelColor[type] ?? colors.purple;
  const icon = (CHANNEL_ICON[type] ?? "message") as React.ComponentProps<
    typeof MaterialCommunityIcons
  >["name"];
  const box = size + 6;
  return (
    <View
      style={[
        styles.wrap,
        { width: box, height: box, borderRadius: box / 2, backgroundColor: bg },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={size - 2} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
