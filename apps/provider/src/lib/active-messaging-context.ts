/** Tracks which chat thread is currently open so message banners can be suppressed. */
let activeConversationId: string | null = null;

export function setActiveMessagingConversationId(id: string | null): void {
  activeConversationId = id?.trim() || null;
}

export function getActiveMessagingConversationId(): string | null {
  return activeConversationId;
}
