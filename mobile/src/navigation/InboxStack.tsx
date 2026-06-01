import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { InboxStackParamList } from "./types";
import { colors } from "../theme";
import { ConversationListScreen } from "../screens/ConversationListScreen";
import { ChatDetailScreen } from "../screens/ChatDetailScreen";
import { ContactProfileScreen } from "../screens/ContactProfileScreen";

const Stack = createNativeStackNavigator<InboxStackParamList>();

export function InboxStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.glow,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen
        name="ConversationList"
        component={ConversationListScreen}
        options={{ title: "Inbox" }}
      />
      <Stack.Screen
        name="ChatDetail"
        component={ChatDetailScreen}
        options={{ title: "" }}
      />
      <Stack.Screen
        name="ContactProfile"
        component={ContactProfileScreen}
        options={{ title: "Contact" }}
      />
    </Stack.Navigator>
  );
}
