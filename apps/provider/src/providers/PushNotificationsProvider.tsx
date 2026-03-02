/**
 * Push Notifications Provider – OneSignal (Provider App)
 * Fetches app_id from superadmin (GET /api/public/third-party-config?service=onesignal).
 * Fallback: EXPO_PUBLIC_ONESIGNAL_APP_ID from env.
 * Registers device with POST /api/me/devices (onesignal_player_id = OneSignal subscription ID).
 * Handles notification tap deep links via expo-router.
 * Notification templates are configured from the superadmin portal.
 */
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import type {
  NotificationClickEvent,
  NotificationWillDisplayEvent,
} from "react-native-onesignal";
import { useAuth } from "@/providers/AuthProvider";
import { ONE_SIGNAL_APP_ID } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { getOneSignalAppId } from "@/lib/third-party-config";
import { captureError } from "@/lib/sentry";

/**
 * Route to the correct screen based on notification payload.
 * Deep links map to provider-specific screens.
 * Supports: type, booking_id, client_id, conversation_id (or chat_id), etc.
 */
function handleNotificationRoute(data: Record<string, unknown>) {
  try {
    const type = String(data.type ?? data.notification_type ?? "");
    const bookingId = data.booking_id != null ? String(data.booking_id) : "";
    const clientId = data.client_id != null ? String(data.client_id) : "";
    const conversationId = String(
      data.conversation_id ?? data.chat_id ?? data.id ?? "",
    );
    const genericId = String(
      data.id ?? data.booking_id ?? data.chat_id ?? data.conversation_id ?? data.client_id ?? "",
    );

    switch (type) {
      // Booking notifications
      case "new_booking":
      case "booking_confirmed":
      case "booking_cancelled":
      case "booking_updated":
      case "booking_rescheduled":
      case "booking_reminder":
      case "booking_completed":
        if (bookingId || genericId) {
          router.push({
            pathname: "/(app)/(tabs)/more/bookings/[id]",
            params: { id: bookingId || genericId },
          });
        } else {
          router.push("/(app)/(tabs)/more/bookings");
        }
        break;

      // Client notifications
      case "new_client":
      case "client_note":
        if (clientId || genericId) {
          router.push({
            pathname: "/(app)/(tabs)/more/clients/[id]",
            params: { id: clientId || genericId },
          });
        } else {
          router.push("/(app)/(tabs)/more/bookings");
        }
        break;

      // Message notifications – open provider messaging
      case "new_message":
      case "chat_message":
        if (conversationId) {
          router.push({
            pathname: "/(app)/(tabs)/more/messaging/[id]",
            params: { id: conversationId },
          });
        } else {
          router.push("/(app)/(tabs)/more/messaging");
        }
        break;

      // Review notifications
      case "new_review":
      case "review_response":
        router.push("/(app)/(tabs)/more/reviews");
        break;

      // Team notifications
      case "staff_schedule_change":
      case "team_update":
        router.push("/(app)/(tabs)/more/team");
        break;

      // Financial notifications
      case "payout_completed":
      case "payout_sent":
      case "payment_received":
      case "payment_failed":
        router.push("/(app)/(tabs)/more/finance");
        break;

      // Waitlist notifications
      case "waitlist_update":
        router.push("/(app)/(tabs)/more/waitlist");
        break;

      // Subscription notifications
      case "subscription_expiring":
      case "subscription_renewed":
        router.push("/(app)/(tabs)/more/subscription");
        break;

      default:
        // Open from notification with no specific target → same screen as header bell
        router.push("/(app)/notifications");
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

  // Fetch OneSignal app_id from backend
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
  }, [user]);

  // Initialize OneSignal and register device
  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;

    const registerWithBackend = async (playerId: string) => {
      if (registeredRef.current) return;
      try {
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await api.post<{ registered?: boolean }>(
          "/api/me/devices",
          {
            player_id: playerId,
            platform,
            app_type: "provider",
          },
        );
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

        // Identify the provider user
        OneSignal.login(user.id);

        // Handle notification taps for deep linking
        OneSignal.Notifications.addEventListener(
          "click",
          (event: NotificationClickEvent) => {
            const additionalData = event.notification.additionalData as
              | Record<string, unknown>
              | undefined;
            if (additionalData) {
              handleNotificationRoute(additionalData);
            }
          },
        );

        // Handle foreground notifications
        OneSignal.Notifications.addEventListener(
          "foregroundWillDisplay",
          (event: NotificationWillDisplayEvent) => {
            event.getNotification().display();
          },
        );

        // Register device with backend
        const subId = await OneSignal.User.pushSubscription.getIdAsync();
        if (subId) {
          await registerWithBackend(subId);
        } else {
          const retry = setTimeout(async () => {
            const retryId =
              await OneSignal.User.pushSubscription.getIdAsync();
            if (retryId) await registerWithBackend(retryId);
          }, 3000);
          unsubscribe = () => clearTimeout(retry);
        }
      } catch (e) {
        captureError(
          e instanceof Error ? e : new Error("OneSignal init failed"),
        );
      }
    };

    init();
    return () => {
      unsubscribe?.();
    };
  }, [appId, user]);
}

/**
 * Cleanup OneSignal session on sign out
 */
function useOneSignalLogout() {
  const { user } = useAuth();
  const prevUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

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
  }, [user]);
}

export function PushNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  usePushRegistration();
  useOneSignalLogout();
  return <>{children}</>;
}
