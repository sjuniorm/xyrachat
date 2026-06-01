import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "../components/Avatar";
import { registerForPushNotifications } from "../lib/push";
import type { Availability } from "../types";

const AVAILABILITY: { key: Availability; label: string; color: string }[] = [
  { key: "online", label: "Online", color: colors.online },
  { key: "away", label: "Away", color: colors.away },
  { key: "offline", label: "Offline", color: colors.offline },
];

export function SettingsScreen() {
  const { profile, session, signOut, setAvailability } = useAuth();
  const [pushStatus, setPushStatus] = useState<string>("undetermined");

  const checkPush = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPushStatus(status);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkPush();
    }, [checkPush]),
  );
  useEffect(() => {
    void checkPush();
  }, [checkPush]);

  const name = profile?.full_name || session?.user?.email || "Agent";
  const email = profile?.email || session?.user?.email || "";
  const version = Constants.expoConfig?.version ?? "1.0.0";

  const onPushPress = async () => {
    if (pushStatus === "denied") {
      Alert.alert(
        "Notifications are off",
        "Enable notifications for Xyra Chat in your device Settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    await registerForPushNotifications();
    await checkPush();
  };

  const onLogout = () => {
    Alert.alert("Sign out", "Sign out of Xyra Chat on this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Profile */}
      <View style={styles.profile}>
        <Avatar uri={profile?.avatar_url} name={name} size={72} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}
          {profile?.role ? (
            <View style={styles.roleChip}>
              <Text style={styles.roleText}>{profile.role}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Availability */}
      <Text style={styles.sectionTitle}>Availability</Text>
      <View style={styles.segment}>
        {AVAILABILITY.map((a) => {
          const active = profile?.availability === a.key;
          return (
            <Pressable
              key={a.key}
              style={[styles.segmentBtn, active && styles.segmentActive]}
              onPress={() => setAvailability(a.key)}
            >
              <View style={[styles.dot, { backgroundColor: a.color }]} />
              <Text
                style={[styles.segmentText, active && styles.segmentTextActive]}
              >
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Notifications */}
      <Text style={styles.sectionTitle}>Notifications</Text>
      <Pressable style={styles.listRow} onPress={onPushPress}>
        <MaterialCommunityIcons
          name="bell-outline"
          size={20}
          color={colors.textMuted}
        />
        <Text style={styles.listLabel}>Push notifications</Text>
        <Text
          style={[
            styles.listValue,
            { color: pushStatus === "granted" ? colors.online : colors.away },
          ]}
        >
          {pushStatus === "granted"
            ? "On"
            : pushStatus === "denied"
              ? "Off"
              : "Enable"}
        </Text>
      </Pressable>

      {/* About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.listRow}>
        <MaterialCommunityIcons
          name="information-outline"
          size={20}
          color={colors.textMuted}
        />
        <Text style={styles.listLabel}>Version</Text>
        <Text style={styles.listValue}>{version}</Text>
      </View>
      <Pressable
        style={styles.listRow}
        onPress={() => Linking.openURL("https://xyrachat.com")}
      >
        <MaterialCommunityIcons
          name="web"
          size={20}
          color={colors.textMuted}
        />
        <Text style={styles.listLabel}>xyrachat.com</Text>
        <MaterialCommunityIcons
          name="open-in-new"
          size={16}
          color={colors.textFaint}
        />
      </Pressable>

      {/* Logout */}
      <Pressable style={styles.logout} onPress={onLogout}>
        <MaterialCommunityIcons name="logout" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
  },
  name: { color: colors.text, fontSize: 20, fontWeight: "700" },
  email: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  roleChip: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleText: {
    color: colors.glow,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 22,
    marginBottom: 8,
  },
  segment: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentActive: { borderColor: colors.purple, backgroundColor: colors.surfaceAlt },
  dot: { width: 8, height: 8, borderRadius: 4 },
  segmentText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  segmentTextActive: { color: colors.text },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  listLabel: { color: colors.text, fontSize: 15, flex: 1 },
  listValue: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: "700" },
});
