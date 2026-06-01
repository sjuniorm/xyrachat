import React from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme";
import { initials } from "../lib/format";

type Props = {
  uri?: string | null;
  name: string;
  size?: number;
  badge?: React.ReactNode; // bottom-right overlay (channel icon / status dot)
  style?: ViewStyle;
};

export function Avatar({ uri, name, size = 48, badge, style }: Props) {
  const radius = size / 2;
  return (
    <View style={[{ width: size, height: size }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: radius },
          ]}
        >
          <Text style={[styles.initials, { fontSize: size * 0.36 }]}>
            {initials(name)}
          </Text>
        </View>
      )}
      {badge ? <View style={styles.badge}>{badge}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: colors.white,
    fontWeight: "700",
  },
  badge: {
    position: "absolute",
    right: -2,
    bottom: -2,
  },
});
