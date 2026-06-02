import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../theme";
import { useAuth } from "../auth/AuthContext";
import { Wordmark } from "../components/GradientButton";
import { LoginScreen } from "../screens/LoginScreen";
import { MainTabs } from "./MainTabs";

export function RootNavigator() {
  const { initializing, session, profile } = useAuth();

  if (initializing) {
    return (
      <View style={styles.splash}>
        <Wordmark size={32} />
        <ActivityIndicator color={colors.glow} style={{ marginTop: 24 }} />
      </View>
    );
  }

  // Key by active org so switching workspace remounts the whole tab tree and
  // every screen refetches its org-scoped data.
  return session ? (
    <MainTabs key={profile?.org_id ?? "no-org"} />
  ) : (
    <LoginScreen />
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
