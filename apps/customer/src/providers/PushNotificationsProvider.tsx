/**
 * Push Notifications Provider – OneSignal
 * Fetches app_id from superadmin (GET /api/public/third-party-config?service=onesignal).
 * Fallback: EXPO_PUBLIC_ONESIGNAL_APP_ID from env.
 * Registers device with POST /api/me/devices (onesignal_player_id = OneSignal subscription ID).
 * Handles notification tap deep links via expo-router.
 * Requires development build (not Expo Go).
 */
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import type { NotificationClickEvent, NotificationWillDisplayEvent } from "react-native-onesignal";
import { useAuth } from "@/providers/AuthProvider";
import { ONE_SIGNAL_APP_ID } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { getOneSignalAppId } from "@/lib/third-party-config";
import { trackNotificationOpened } from "@/lib/analytics";
import { addBreadcrumb } from "@/lib/sentry";

/**
 * Route to the correct screen based on notification payload.
 */
function handleNotificationRoute(data: Record<string, unknown>) {
  try {
    const type = String(data.type ?? data.notification_type ?? "");
    const id = String(data.id ?? data.booking_id ?? data.chat_id ?? data.conversation_id ?? data.post_id ?? "");

    addBreadcrumb("Notification tapped", "notification", { type, id });
    trackNotificationOpened(type, data);

    switch (type) {
      case "booking_reminder":
      case "booking_confirmed":
      case "booking_confirmation": // on-demand accepted
      case "booking_cancelled":
      case "booking_updated":
      case "booking_completed":
      case "provider_arrived":
        if (id) {
          router.push({ pathname: "/(app)/booking-detail", params: { id } });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        break;

      case "new_message":
      case "chat_message":
        if (id) {
          router.push({ pathname: "/(app)/chat", params: { id } });
        } else {
          router.push("/(app)/(tabs)/chats");
        }
        break;

      case "review_response":
      case "review_request":
        router.push("/(app)/account-settings/reviews");
        break;

      case "custom_request_response":
        router.push("/(app)/account-settings/custom-requests");
        break;

      case "waitlist_available":
        router.push("/(app)/account-settings/waitlist");
        break;

      case "promotion":
      case "marketing":
        if (data.provider_slug) {
          router.push({
            pathname: "/(app)/partner-profile",
            params: { slug: String(data.provider_slug) },
          });
        } else {
          router.push("/(app)/(tabs)/explore");
        }
        break;

      case "explore_post":
        if (id) {
          router.push({ pathname: "/(app)/explore-post", params: { id } });
        } else {
          router.push("/(app)/(tabs)/explore");
        }
        break;

      default:
        // Fallback: go to home
        router.push("/(app)/(tabs)/home");
        break;
    }
  } catch {
    // Silently fail on routing errors
  }
}

function usePushRegistration() {
  const { user } = useAuth();
  const registeredRef = useRef(false);
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web" || !user) return;

    let cancelled = false;
    (async () => {
      const fromApi = await getOneSignalAppId();
      if (cancelled) return;
      const id = fromApi || ONE_SIGNAL_APP_ID || "";
      setAppId(id ? id : null);
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run when user id available
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;

    const registerWithBackend = async (playerId: string) => {
      if (registeredRef.current) return;
      try {
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await api.post<{ registered?: boolean }>("/api/me/devices", {
          player_id: playerId,
          platform,
        });
        if (!res.error) {
          registeredRef.current = true;
        }
      } catch {
        // Silent fail – device registration is best-effort
      }
    };

    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        const { OneSignal, LogLevel } = await import("react-native-onesignal");

        OneSignal.Debug.setLogLevel(LogLevel.None);
        OneSignal.initialize(appId);
        OneSignal.Notifications.requestPermission(false);

        OneSignal.login(user.id);

        // Handle notification taps for deep linking
        OneSignal.Notifications.addEventListener("click", (event: NotificationClickEvent) => {
          const additionalData = event.notification.additionalData as
            | Record<string, unknown>
            | undefined;
          if (additionalData) {
            handleNotificationRoute(additionalData);
          }
        });

        // Handle foreground notifications (show in-app banner)
        OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: NotificationWillDisplayEvent) => {
          event.getNotification().display();
        });

        const subId = await OneSignal.User.pushSubscription.getIdAsync();
        if (subId) {
          await registerWithBackend(subId);
        } else {
          const retry = setTimeout(async () => {
            const id = await OneSignal.User.pushSubscription.getIdAsync();
            if (id) await registerWithBackend(id);
          }, 3000);
          unsubscribe = () => clearTimeout(retry);
        }
      } catch {
        // OneSignal not available (e.g. Expo Go)
      }
    };

    init();
    return () => {
      unsubscribe?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run when appId/user available
  }, [appId, user?.id]);
}

/**
 * Cleanup OneSignal session on sign out
 */
function useOneSignalLogout() {
  const { user } = useAuth();
  const prevUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    // If user was logged in and now logged out
    if (prevUserRef.current && !user) {
      (async () => {
        try {
          const { OneSignal } = await import("react-native-onesignal");
          OneSignal.logout();
        } catch {
          // OneSignal not available
        }
      })();
    }
    prevUserRef.current = user?.id ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- track user for logout cleanup
  }, [user?.id]);
}

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  usePushRegistration();
  useOneSignalLogout();
  return <>{children}</>;
}
