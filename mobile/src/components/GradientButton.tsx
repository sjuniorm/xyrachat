import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradient } from "../theme";

export function GradientButton({
  label,
  onPress,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        { opacity: isDisabled ? 0.55 : pressed ? 0.88 : 1 },
        style,
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.button}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.label}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <View style={styles.wordmark}>
      <Text style={[styles.word, { color: colors.purple, fontSize: size }]}>
        Xyra
      </Text>
      <Text style={[styles.word, { color: colors.pink, fontSize: size }]}>
        {" "}
        Chat
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { color: colors.white, fontSize: 16, fontWeight: "700" },
  wordmark: { flexDirection: "row", alignItems: "center" },
  word: { fontWeight: "800", letterSpacing: 0.5 },
});
