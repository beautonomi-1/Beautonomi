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
          // OS badge is driven by NotificationsContext + server count (not push payload alone).
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      if (Platform.OS === "android") {
        const HIGH = Notifications.AndroidImportance.HIGH;
        const DEFAULT = Notifications.AndroidImportance.DEFAULT;
        const LOW = Notifications.AndroidImportance.LOW;
        // Per-category channels so users can tune (or mute) each kind of alert
        // from Android system settings, and so urgent vs marketing don't share
        // one bucket. The OneSignal payload targets these via
        // `existing_android_channel_id` (see ANDROID_CHANNEL_IDS in the backend).
        const channels: Array<{
          id: string;
          name: string;
          importance: number;
          sound?: string;
          showBadge?: boolean;
        }> = [
          { id: "default", name: "General", importance: HIGH, sound: "default", showBadge: true },
          { id: "bookings", name: "Bookings & appointments", importance: HIGH, sound: "default", showBadge: true },
          { id: "messages", name: "Messages", importance: HIGH, sound: "default", showBadge: true },
          { id: "payments", name: "Payments & receipts", importance: HIGH, sound: "default", showBadge: true },
          { id: "reminders", name: "Reminders", importance: DEFAULT, sound: "default", showBadge: true },
          { id: "marketing", name: "Offers & promotions", importance: LOW, showBadge: false },
        ];
        for (const ch of channels) {
          await Notifications.setNotificationChannelAsync(ch.id, {
            name: ch.name,
            importance: ch.importance,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF385C",
            sound: ch.sound,
            enableVibrate: true,
            showBadge: ch.showBadge ?? true,
          });
        }
      }

      // iOS notification categories: actionable buttons in the tray. The backend
      // sets `ios_category` on the matching push so iOS renders these actions.
      // Action taps surface via the OneSignal click listener's `result.actionId`.
      try {
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
