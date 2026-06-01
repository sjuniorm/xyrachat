import "react-native-gesture-handler";
import React, { useCallback, useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { PaperProvider } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { paperTheme, navTheme } from "./src/theme";
import { AuthProvider } from "./src/auth/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { navigationRef, navigateToConversation } from "./src/navigation/ref";

export default function App() {
  // Conversation id from a tapped notification, held until navigation is ready
  // (on cold start the tap fires before the navigator mounts).
  const pending = useRef<string | null>(null);

  const flushPending = useCallback(() => {
    if (pending.current && navigationRef.isReady()) {
      navigateToConversation(pending.current);
      pending.current = null;
    }
  }, []);

  const handleResponse = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as
        | { conversationId?: string }
        | undefined;
      if (data?.conversationId) {
        pending.current = data.conversationId;
        flushPending();
      }
    },
    [flushPending],
  );

  useEffect(() => {
    // Cold start: did a notification launch the app?
    void Notifications.getLastNotificationResponseAsync().then(handleResponse);
    // Runtime: tapped while the app is open / backgrounded.
    const sub =
      Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [handleResponse]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <AuthProvider>
            <NavigationContainer
              ref={navigationRef}
              theme={navTheme}
              onReady={flushPending}
            >
              <StatusBar style="light" />
              <RootNavigator />
            </NavigationContainer>
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
