import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme";
import { useMyAssigned } from "../hooks/useMyAssigned";
import { registerForPushNotifications } from "../lib/push";
import { ConversationRow } from "../components/ConversationRow";
import { ConversationListSkeleton } from "../components/Skeleton";
import { navigateToConversation } from "../navigation/ref";

export function NotificationsScreen() {
  const { items, loading, refreshing, refresh } = useMyAssigned();
  const [permission, setPermission] = useState<string>("undetermined");

  const checkPermission = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermission(status);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission]),
  );

  useEffect(() => {
    void checkPermission();
  }, [checkPermission]);

  const enablePush = async () => {
    await registerForPushNotifications();
    await checkPermission();
  };

  const showEnableCard = permission !== "granted";

  return (
    <View style={styles.container}>
      {loading ? (
        <ConversationListSkeleton />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={
            showEnableCard ? (
              <Pressable style={styles.enableCard} onPress={enablePush}>
                <MaterialCommunityIcons
                  name="bell-ring-outline"
                  size={22}
                  color={colors.glow}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.enableTitle}>Turn on notifications</Text>
                  <Text style={styles.enableText}>
                    Get pinged the moment a customer messages a conversation
                    assigned to you.
                  </Text>
                </View>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <ConversationRow
              item={item}
              onPress={() => navigateToConversation(item.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={items.length === 0 && styles.emptyWrap}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.glow}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons
                name="bell-check-outline"
                size={48}
                color={colors.textFaint}
              />
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.emptyText}>
                Open conversations assigned to you show up here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  enableCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  enableTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  enableText: { color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 78,
  },
  emptyWrap: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 10,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
