import type { NavigatorScreenParams } from "@react-navigation/native";

export type InboxStackParamList = {
  ConversationList: undefined;
  ChatDetail: { conversationId: string };
  ContactProfile: { contactId: string };
};

export type ContactsStackParamList = {
  ContactsList: undefined;
  ContactProfile: { contactId: string };
};

export type RootTabParamList = {
  Inbox: NavigatorScreenParams<InboxStackParamList>;
  Contacts: NavigatorScreenParams<ContactsStackParamList>;
  Team: undefined;
  Notifications: undefined;
  Settings: undefined;
};
