import { DeviceEventEmitter } from "react-native";

/** Emitted when a push arrives or badge should re-sync from the server. */
export const NOTIFICATION_BADGE_REFRESH_EVENT = "beautonomi:notifications:badge-refresh";

export function emitNotificationBadgeRefresh(): void {
  DeviceEventEmitter.emit(NOTIFICATION_BADGE_REFRESH_EVENT);
}
