/**
 * Provider conversations: list + thread live on the Chats tab and (for the
 * More menu) under `more/messaging`. Pushes from notifications and deep links
 * should use the Chats tab so the More stack stays on the hub.
 */
export const PROVIDER_CHATS_MESSAGING_LIST = "/(app)/(tabs)/chats" as const;

export function providerChatsMessagingThread(conversationId: string): string {
  return `/(app)/(tabs)/chats/${conversationId}`;
}

export const PROVIDER_MORE_MESSAGING_LIST = "/(app)/(tabs)/more/messaging" as const;

export function providerMoreMessagingThread(conversationId: string): string {
  return `/(app)/(tabs)/more/messaging/${conversationId}`;
}

/** Resolve which stack the shared messaging screens are mounted under. */
export function providerMessagingBaseFromPathname(pathname: string | undefined): string {
  if (typeof pathname === "string" && pathname.includes("/chats") && !pathname.includes("/more/messaging")) {
    return PROVIDER_CHATS_MESSAGING_LIST;
  }
  return PROVIDER_MORE_MESSAGING_LIST;
}
