import { DeviceEventEmitter } from "react-native";

/** Emitted when a push arrives or badge should re-sync from the server. */
export const NOTIFICATION_BADGE_REFRESH_EVENT = "beautonomi:notifications:badge-refresh";

/** Emitted when chat unread should re-sync (message sent/received or conversation read). */
export const CHAT_BADGE_REFRESH_EVENT = "beautonomi:chat:badge-refresh";

export function emitNotificationBadgeRefresh(): void {
  DeviceEventEmitter.emit(NOTIFICATION_BADGE_REFRESH_EVENT);
}

export function emitChatBadgeRefresh(): void {
  DeviceEventEmitter.emit(CHAT_BADGE_REFRESH_EVENT);
  emitNotificationBadgeRefresh();
}
