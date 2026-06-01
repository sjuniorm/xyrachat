import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ContactsStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { supabase } from "../lib/supabase";
import { Avatar } from "../components/Avatar";
import { ConversationListSkeleton } from "../components/Skeleton";
import { contactDisplayName } from "../lib/format";
import type { Contact } from "../types";

type Props = NativeStackScreenProps<ContactsStackParamList, "ContactsList">;

function contactSubtitle(c: Contact): string {
  return c.phone || c.email || c.instagram_id || c.telegram_id || "";
}

export function ContactsScreen({ navigation }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    setContacts((data as Contact[] | null) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      return (
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.instagram_id ?? "").toLowerCase().includes(q) ||
        (c.telegram_id ?? "").toLowerCase().includes(q)
      );
    });
  }, [contacts, query]);

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <MaterialCommunityIcons
          name="magnify"
          size={18}
          color={colors.textFaint}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search contacts"
          placeholderTextColor={colors.textFaint}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <MaterialCommunityIcons
              name="close-circle"
              size={18}
              color={colors.textFaint}
            />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ConversationListSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => {
            const name = contactDisplayName(item);
            const sub = contactSubtitle(item);
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() =>
                  navigation.navigate("ContactProfile", { contactId: item.id })
                }
              >
                <Avatar uri={item.avatar_url} name={name} size={44} />
                <View style={styles.rowBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  {sub ? (
                    <Text style={styles.sub} numberOfLines={1}>
                      {sub}
                    </Text>
                  ) : null}
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={colors.textFaint}
                />
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={filtered.length === 0 && styles.emptyWrap}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.glow}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons
                name="account-multiple-outline"
                size={44}
                color={colors.textFaint}
              />
              <Text style={styles.emptyText}>
                {query ? "No contacts match your search." : "No contacts yet."}
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
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 14,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  search: { flex: 1, color: colors.text, fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  pressed: { backgroundColor: colors.surface },
  rowBody: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 15, fontWeight: "600" },
  sub: { color: colors.textMuted, fontSize: 13 },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 72,
  },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
});
