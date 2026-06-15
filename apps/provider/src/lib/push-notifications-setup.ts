/**
 * Native push helpers that must run once at startup (badge + Android channel behaviour).
 * OneSignal delivers remote notifications; expo-notifications handles badge counts.
 */
import { Platform } from "react-native";

let configured = false;

export function configureNativePushNotifications() {
  if (configured || Platform.OS === "web") return;
  configured = true;

  void (async () => {
    try {
      const Notifications = await import("expo-notifications");
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          // Reconcile to exact server count on app open; allow push to bump badge when killed.
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      if (Platform.OS === "android") {
        const HIGH = Notifications.AndroidImportance.HIGH;
        const DEFAULT = Notifications.AndroidImportance.DEFAULT;
        const LOW = Notifications.AndroidImportance.LOW;
        // Per-category channels (mirrors the customer app) so the OneSignal
        // payload can target a specific bucket via `existing_android_channel_id`
        // and providers can mute marketing without losing booking/payment alerts.
        const channels: Array<{
          id: string;
          name: string;
          importance: number;
          sound?: string;
          showBadge?: boolean;
        }> = [
          { id: "default", name: "General", importance: HIGH, sound: "default", showBadge: true },
          { id: "bookings", name: "Bookings & appointments", importance: HIGH, sound: "default", showBadge: true },
          { id: "messages", name: "Client messages", importance: HIGH, sound: "default", showBadge: true },
          { id: "payments", name: "Payments & payouts", importance: HIGH, sound: "default", showBadge: true },
          { id: "reminders", name: "Reminders", importance: DEFAULT, sound: "default", showBadge: true },
          { id: "marketing", name: "Updates & promotions", importance: LOW, showBadge: false },
        ];
        for (const ch of channels) {
          await Notifications.setNotificationChannelAsync(ch.id, {
            name: ch.name,
            importance: ch.importance,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#111827",
            sound: ch.sound,
            enableVibrate: true,
            showBadge: ch.showBadge ?? true,
          });
        }
      }

      // iOS notification categories: actionable buttons in the tray. The backend
      // sets `ios_category` on matching pushes so iOS renders these actions.
      // Action taps surface via the OneSignal click listener's `result.actionId`.
      try {
        await Notifications.setNotificationCategoryAsync("PROVIDER_BOOKING_REQUEST", [
          {
            identifier: "accept_booking",
            buttonTitle: "Accept",
            options: { opensAppToForeground: true },
          },
          {
            identifier: "decline_booking",
            buttonTitle: "Decline",
            options: { opensAppToForeground: true, isDestructive: true },
          },
        ]);
        await Notifications.setNotificationCategoryAsync("MESSAGE", [
          {
            identifier: "mark_read",
            buttonTitle: "Mark as read",
            options: { opensAppToForeground: false },
          },
        ]);
      } catch {
        // setNotificationCategoryAsync unavailable until native rebuild
      }
    } catch {
      // Dev client without native rebuild
    }
  })();
}
