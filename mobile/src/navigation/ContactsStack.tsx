import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { ContactsStackParamList } from "./types";
import { colors } from "../theme";
import { ContactsScreen } from "../screens/ContactsScreen";
import { ContactProfileScreen } from "../screens/ContactProfileScreen";

const Stack = createNativeStackNavigator<ContactsStackParamList>();

export function ContactsStack() {
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
        name="ContactsList"
        component={ContactsScreen}
        options={{ title: "Contacts" }}
      />
      <Stack.Screen
        name="ContactProfile"
        component={ContactProfileScreen}
        options={{ title: "Contact" }}
      />
    </Stack.Navigator>
  );
}
