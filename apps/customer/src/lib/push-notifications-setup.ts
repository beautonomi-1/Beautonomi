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
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Beautonomi",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF385C",
          sound: "default",
          enableVibrate: true,
          showBadge: true,
        });
      }
    } catch {
      // Dev client without native rebuild
    }
  })();
}
