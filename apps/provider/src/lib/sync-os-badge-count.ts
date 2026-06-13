import { Platform } from "react-native";

/**
 * Set the OS app-icon badge and reconcile against the launcher-reported count.
 */
export async function syncOsBadgeCount(expected: number): Promise<void> {
  if (Platform.OS === "web") return;
  const n = Math.min(999_999, Math.max(0, Math.floor(expected)));
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.setBadgeCountAsync(n);
    const osCount = await Notifications.getBadgeCountAsync();
    if (osCount !== n) {
      await Notifications.setBadgeCountAsync(n);
    }
  } catch {
    // Native module unavailable or launcher without badge support
  }
}
