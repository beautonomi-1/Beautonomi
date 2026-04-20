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
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
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
    const bookingId = String(data.booking_id ?? data.bookingId ?? "");
    const id = String(
      data.id ?? data.booking_id ?? data.bookingId ?? data.chat_id ?? data.conversation_id ?? data.post_id ?? "",
    );

    addBreadcrumb("Notification tapped", "notification", { type, id });
    trackNotificationOpened(type, data);

    // Template-based pushes include template_key + booking_id but often omit type
    if (!type && bookingId) {
      router.push({ pathname: "/(app)/booking-detail", params: { id: bookingId } });
      return;
    }

    switch (type) {
      case "on_demand_declined": {
        const rid = String(data.on_demand_request_id ?? "");
        if (rid) {
          router.push({
            pathname: "/(app)/on-demand/result",
            params: { status: "declined", requestId: rid },
          });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        break;
      }

      case "on_demand_accepted": {
        const reqId = String(data.on_demand_request_id ?? "");
        const acceptedBookingId = String(data.booking_id ?? data.bookingId ?? "");
        if (acceptedBookingId) {
          router.push({ pathname: "/(app)/booking-detail", params: { id: acceptedBookingId } });
        } else if (reqId) {
          router.push({
            pathname: "/(app)/on-demand/result",
            params: { status: "accepted", requestId: reqId },
          });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        break;
      }

      case "on_demand_expired": {
        const expReqId = String(data.on_demand_request_id ?? "");
        if (expReqId) {
          router.push({
            pathname: "/(app)/on-demand/result",
            params: { status: "expired", requestId: expReqId },
          });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        break;
      }

      case "payment_received":
      case "payment_successful":
      case "payment_failed":
      case "payment_pending":
      case "payment_method_expired":
      case "partial_payment_received":
        if (bookingId || id) {
          router.push({ pathname: "/(app)/booking-detail", params: { id: bookingId || id } });
        } else {
          router.push("/(app)/account-settings/payments");
        }
        break;

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
      case "chat_message": {
        const conversationId = String(data.conversation_id ?? data.chat_id ?? "");
        if (conversationId) {
          router.push({ pathname: "/(app)/chat", params: { id: conversationId } });
        } else {
          router.push("/(app)/(tabs)/chats");
        }
        break;
      }

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
  const { gate } = useNativePermissionsOnboardingGate();
  const registeredRef = useRef(false);
  const oneSignalInitKeyRef = useRef<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);

  // §Customer-audit 2026-04: reset registration guard whenever the
  // authenticated user id changes, not just on sign-out. Previously if
  // the Supabase session flipped from user A to user B without an
  // explicit sign-out (token refresh edge cases, biometric re-auth into
  // a different account), `registeredRef.current` stayed `true` from
  // user A's original register call and `/api/me/devices` never got
  // called for user B — so user B's player id was still linked to user
  // A's server-side row and push notifications routed to the wrong
  // account.
  const lastUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (nextUserId !== lastUserIdRef.current) {
      registeredRef.current = false;
      oneSignalInitKeyRef.current = null;
      lastUserIdRef.current = nextUserId;
    }
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web" || !user) return;

    let cancelled = false;
    (async () => {
      try {
        const fromApi = await getOneSignalAppId();
        if (cancelled) return;
        const id = fromApi || ONE_SIGNAL_APP_ID || "";
        setAppId(id ? id : null);
      } catch {
        // Push optional — ignore config fetch failures
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run when user id available
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;
    if (gate.phase === "loading") return;

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

        const sessionKey = `${user.id}:${appId}`;
        const isFirstInitForSession = oneSignalInitKeyRef.current !== sessionKey;
        if (isFirstInitForSession) {
          oneSignalInitKeyRef.current = sessionKey;
          OneSignal.login(user.id);

          OneSignal.Notifications.addEventListener("click", (event: NotificationClickEvent) => {
            const additionalData = event.notification.additionalData as
              | Record<string, unknown>
              | undefined;
            if (additionalData) {
              handleNotificationRoute(additionalData);
            }
          });

          OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: NotificationWillDisplayEvent) => {
            event.getNotification().display();
          });
        }

        // Returning users (flag already in storage): same behaviour as before this onboarding flow.
        if (gate.phase === "complete" && gate.fromRestore) {
          OneSignal.Notifications.requestPermission(false);
        }

        const subId = await OneSignal.User.pushSubscription.getIdAsync();
        if (subId) {
          await registerWithBackend(subId);
        } else {
          const retry = setTimeout(async () => {
            try {
              const id = await OneSignal.User.pushSubscription.getIdAsync();
              if (id) await registerWithBackend(id);
            } catch {
              // ignore
            }
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
  }, [appId, user, gate]);

  // After first-run onboarding completes, register device if the user just granted push in the sheet.
  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;
    if (gate.phase !== "complete" || gate.fromRestore) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tryRegister = async () => {
      if (cancelled || registeredRef.current) return;
      try {
        const { OneSignal } = await import("react-native-onesignal");
        const id = await OneSignal.User.pushSubscription.getIdAsync();
        if (!id || cancelled || registeredRef.current) return;
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await api.post<{ registered?: boolean }>("/api/me/devices", {
          player_id: id,
          platform,
        });
        if (!res.error) {
          registeredRef.current = true;
        }
      } catch {
        // OneSignal not available
      }
    };

    void tryRegister();
    timeoutId = setTimeout(tryRegister, 2500);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [appId, user, gate]);
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
