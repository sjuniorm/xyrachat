import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "../components/Avatar";
import { registerForPushNotifications } from "../lib/push";
import type { Availability } from "../types";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://xyra-chat.vercel.app";
const SUPPORT_EMAIL = "support@xyrachat.com";

const AVAILABILITY: { key: Availability; label: string; color: string }[] = [
  { key: "online", label: "Online", color: colors.online },
  { key: "away", label: "Away", color: colors.away },
  { key: "offline", label: "Offline", color: colors.offline },
];

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function Row({
  icon,
  label,
  value,
  valueColor,
  onPress,
  chevron,
}: {
  icon: IconName;
  label: string;
  value?: string;
  valueColor?: string;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const content = (
    <View style={styles.listRow}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.textMuted} />
      <Text style={styles.listLabel}>{label}</Text>
      {value ? (
        <Text style={[styles.listValue, valueColor ? { color: valueColor } : null]}>
          {value}
        </Text>
      ) : null}
      {chevron ? (
        <MaterialCommunityIcons
          name="chevron-right"
          size={18}
          color={colors.textFaint}
        />
      ) : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

export function SettingsScreen() {
  const { profile, session, signOut, setAvailability } = useAuth();
  const [pushStatus, setPushStatus] = useState<string>("undetermined");
  const [orgName, setOrgName] = useState<string | null>(null);

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

  useEffect(() => {
    if (!profile?.org_id) return;
    void supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.org_id)
      .maybeSingle()
      .then(({ data }) => setOrgName((data as { name: string } | null)?.name ?? null));
  }, [profile?.org_id]);

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

  const emailSupport = (subject: string, withDiagnostics = false) => {
    const diag = withDiagnostics
      ? `\n\n---\nApp ${version} · ${Platform.OS} ${Platform.Version}\nWorkspace: ${orgName ?? profile?.org_id ?? "?"}\nUser: ${email}`
      : "";
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(diag)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Email", `Reach us at ${SUPPORT_EMAIL}`),
    );
  };

  const onSwitchWorkspace = () => {
    Alert.alert(
      "Switch workspace",
      "Each account belongs to one workspace. To use a different workspace, sign out and sign in with that workspace's account.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut() },
      ],
    );
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

      {/* Workspace */}
      <Text style={styles.sectionTitle}>Workspace</Text>
      <View style={styles.card}>
        <Row icon="domain" label="Current" value={orgName ?? "—"} />
        <Row
          icon="swap-horizontal"
          label="Switch workspace"
          onPress={onSwitchWorkspace}
          chevron
        />
      </View>

      {/* Notifications */}
      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.card}>
        <Row
          icon="bell-outline"
          label="Push notifications"
          value={
            pushStatus === "granted"
              ? "On"
              : pushStatus === "denied"
                ? "Off"
                : "Enable"
          }
          valueColor={pushStatus === "granted" ? colors.online : colors.away}
          onPress={onPushPress}
        />
      </View>

      {/* Support */}
      <Text style={styles.sectionTitle}>Support</Text>
      <View style={styles.card}>
        <Row
          icon="lifebuoy"
          label="Help & support"
          onPress={() => emailSupport("Xyra Chat — support request")}
          chevron
        />
        <Row
          icon="bug-outline"
          label="Report a problem"
          onPress={() => emailSupport("Xyra Chat — problem report", true)}
          chevron
        />
      </View>

      {/* About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <Row icon="information-outline" label="Version" value={version} />
        <Row
          icon="web"
          label="xyrachat.com"
          onPress={() => Linking.openURL("https://xyrachat.com")}
          chevron
        />
        <Row
          icon="shield-lock-outline"
          label="Privacy policy"
          onPress={() => Linking.openURL(`${API_BASE}/privacy`)}
          chevron
        />
        <Row
          icon="file-document-outline"
          label="Terms of service"
          onPress={() => Linking.openURL(`${API_BASE}/terms`)}
          chevron
        />
      </View>

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
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
