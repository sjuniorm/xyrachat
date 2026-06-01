import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  Pressable,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { InboxStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { useConversations } from "../hooks/useConversations";
import { useAuth } from "../auth/AuthContext";
import { ConversationRow } from "../components/ConversationRow";
import { ConversationListSkeleton } from "../components/Skeleton";

type Filter = "all" | "mine" | "open";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "open", label: "Open" },
];

type Props = NativeStackScreenProps<InboxStackParamList, "ConversationList">;

export function ConversationListScreen({ navigation }: Props) {
  const { conversations, loading, refreshing, refresh } = useConversations();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [filter, setFilter] = useState<Filter>("all");

  const data = useMemo(() => {
    switch (filter) {
      case "mine":
        return conversations.filter((c) => c.assigned_to === userId);
      case "open":
        return conversations.filter(
          (c) => c.status === "open" || c.status === "bot",
        );
      default:
        return conversations;
    }
  }, [conversations, filter, userId]);

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ConversationListSkeleton />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationRow
              item={item}
              onPress={() =>
                navigation.navigate("ChatDetail", { conversationId: item.id })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={data.length === 0 && styles.emptyWrap}
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
                name="message-text-outline"
                size={48}
                color={colors.textFaint}
              />
              <Text style={styles.emptyTitle}>No conversations</Text>
              <Text style={styles.emptyText}>
                {filter === "all"
                  ? "Connect a channel on the Xyra Chat web app and incoming messages will show up here."
                  : "Nothing matches this filter right now."}
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
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.purple },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: colors.white },
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
