/**
 * Module-level singletons tracking which screen is currently in the foreground.
 * Used by NotificationBannerListener to suppress redundant banners when the
 * customer is already looking at the relevant screen.
 *
 * Mirrors the provider app's `getActiveMessagingConversationId()` pattern.
 */

let activeChatConversationId: string | null = null;
let activeBookingId: string | null = null;

export function setActiveChatConversationId(id: string | null): void {
  activeChatConversationId = id;
}

export function getActiveChatConversationId(): string | null {
  return activeChatConversationId;
}

export function setActiveBookingId(id: string | null): void {
  activeBookingId = id;
}

export function getActiveBookingId(): string | null {
  return activeBookingId;
}
