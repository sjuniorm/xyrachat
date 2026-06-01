import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../theme";
import { useAuth } from "../auth/AuthContext";
import { Wordmark } from "../components/GradientButton";
import { LoginScreen } from "../screens/LoginScreen";
import { MainTabs } from "./MainTabs";

export function RootNavigator() {
  const { initializing, session } = useAuth();

  if (initializing) {
    return (
      <View style={styles.splash}>
        <Wordmark size={32} />
        <ActivityIndicator color={colors.glow} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return session ? <MainTabs /> : <LoginScreen />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
