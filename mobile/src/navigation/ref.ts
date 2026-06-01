import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootTabParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootTabParamList>();

/** Deep-link into a conversation thread (used from a notification tap). */
export function navigateToConversation(conversationId: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate("Inbox", {
    screen: "ChatDetail",
    params: { conversationId },
  });
}
