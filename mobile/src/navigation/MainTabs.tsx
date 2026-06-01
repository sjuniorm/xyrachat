import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { RootTabParamList } from "./types";
import { colors } from "../theme";
import { useMyAssigned } from "../hooks/useMyAssigned";
import { InboxStack } from "./InboxStack";
import { ContactsStack } from "./ContactsStack";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";

const Tab = createBottomTabNavigator<RootTabParamList>();

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function MainTabs() {
  const { count } = useMyAssigned();

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.glow,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tab.Screen
        name="Inbox"
        component={InboxStack}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name={"message-text-outline" as IconName}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsStack}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name={"account-multiple-outline" as IconName}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: "Notifications",
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.pink },
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name={"bell-outline" as IconName}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name={"cog-outline" as IconName}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
