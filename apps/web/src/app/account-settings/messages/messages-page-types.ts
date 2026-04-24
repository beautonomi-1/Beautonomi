import type { CustomerConversationListItem } from "./dedupe-customer-conversations";

export type MessagesConversation = CustomerConversationListItem;

export type MessagesPageInitial = {
  conversations: MessagesConversation[];
  currentUserId: string;
};
