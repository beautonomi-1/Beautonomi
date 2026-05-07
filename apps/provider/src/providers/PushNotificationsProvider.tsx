/**
 * Push Notifications Provider – OneSignal (Provider App)
 * Fetches app_id from superadmin (GET /api/public/third-party-config?service=onesignal).
 * Fallback: EXPO_PUBLIC_ONESIGNAL_APP_ID from env.
 * Registers device with POST /api/me/devices (onesignal_player_id = OneSignal subscription ID).
 * Handles notification tap deep links via expo-router.
 * Notification templates are configured from the superadmin portal.
 */
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Vibration } from "react-native";
import { router } from "expo-router";
import type {
  NotificationClickEvent,
  NotificationWillDisplayEvent,
} from "react-native-onesignal";
import { useAuth } from "@/providers/AuthProvider";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
import { ONE_SIGNAL_APP_ID } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { getOneSignalAppId } from "@/lib/third-party-config";
import { captureError, addBreadcrumb } from "@/lib/sentry";
import { isTransientApiFailure } from "@/lib/api-error";

/** Keys from sendTemplateNotification(..., { appType: "provider" }); payload uses template_key, not type. */
const PROVIDER_BOOKING_TEMPLATE_KEYS = new Set([
  "provider_booking_request",
  "provider_booking_cancelled",
  "provider_booking_rescheduled",
  "provider_booking_time_changed",
  "provider_booking_date_changed",
  "provider_new_customer",
  "provider_recurring_customer",
  "provider_preferred_customer",
  "provider_special_instructions",
  "allergy_alert_provider",
  "provider_weather_alert",
  "provider_dispute_opened",
  "provider_dispute_resolved",
  "provider_custom_request",
]);

/**
 * Route to the correct screen based on notification payload.
 * Deep links map to provider-specific screens.
 * Supports: type, template_key, booking_id, client_id, conversation_id (or chat_id), etc.
 */
function handleNotificationRoute(data: Record<string, unknown>) {
  try {
    const templateKey = String(data.template_key ?? "");
    const type = String(data.type ?? data.notification_type ?? "");
    const bookingId = data.booking_id != null ? String(data.booking_id) : "";
    const clientId = data.client_id != null ? String(data.client_id) : "";
    const conversationId = String(
      data.conversation_id ?? data.chat_id ?? "",
    );
    const genericId = String(
      data.id ?? data.booking_id ?? data.chat_id ?? data.conversation_id ?? data.client_id ?? "",
    );
    const onDemandRequestId = String(
      data.on_demand_request_id ?? data.id ?? "",
    );
    const productOrderId = String(data.product_order_id ?? data.order_id ?? "").trim();
    const broadcastDeepLink =
      typeof data.url === "string"
        ? data.url.trim()
        : typeof data.deep_link === "string"
          ? String(data.deep_link).trim()
          : "";

    if (type === "admin_broadcast") {
      const u = broadcastDeepLink;
      if (u) {
        if (u.startsWith("http://") || u.startsWith("https://")) {
          void Linking.openURL(u);
        } else {
          router.push(u as never);
        }
      } else {
        router.push("/(app)/announcements" as never);
      }
      return;
    }

    // ── Superadmin template pushes (OneSignal data = { template_key, ...variables }) ──
    if (templateKey === "provider_new_message") {
      const cid = String(data.conversation_id ?? data.chat_id ?? "");
      if (cid) {
        router.push({
          pathname: "/(app)/(tabs)/chats/[id]",
          params: { id: cid },
        });
      } else {
        router.push("/(app)/(tabs)/chats");
      }
      return;
    }

    if (
      templateKey.startsWith("provider_payout_") ||
      templateKey === "provider_earnings_summary"
    ) {
      router.push("/(app)/(tabs)/more/finance");
      return;
    }

    if (templateKey === "provider_new_review") {
      if (bookingId) {
        router.push({
          pathname: "/(app)/(tabs)/bookings/[id]",
          params: { id: bookingId },
        });
      } else {
        router.push("/(app)/(tabs)/more/reviews");
      }
      return;
    }

    if (templateKey === "low_stock_alert") {
      router.push("/(app)/(tabs)/more/products");
      return;
    }

    if (
      templateKey.includes("product_order") ||
      templateKey === "provider_new_product_order"
    ) {
      if (productOrderId) {
        router.push(
          `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(productOrderId)}` as never,
        );
      } else {
        router.push("/(app)/(tabs)/more/orders-hub" as never);
      }
      return;
    }

    if (templateKey === "provider_on_demand_request") {
      if (onDemandRequestId) {
        router.push({
          pathname: "/(app)/on-demand/incoming/[id]",
          params: { id: onDemandRequestId },
        });
      } else {
        router.push("/(app)/(tabs)/bookings");
      }
      return;
    }

    if (templateKey === "provider_waiting_room" || templateKey === "provider_check_in") {
      router.push("/(app)/(tabs)/more/waiting-room");
      return;
    }

    if (
      templateKey === "provider_availability_changed" ||
      templateKey === "provider_holiday_mode" ||
      templateKey === "provider_holiday_mode_ending"
    ) {
      router.push("/(app)/(tabs)/more/settings/hours");
      return;
    }

    if (templateKey === "provider_break_scheduled") {
      router.push("/(app)/(tabs)/calendar");
      return;
    }

    if (
      templateKey === "provider_onboarding_welcome" ||
      templateKey === "provider_profile_approved" ||
      templateKey === "provider_profile_rejected"
    ) {
      router.push("/(app)/(tabs)/more/settings/verification");
      return;
    }

    if (PROVIDER_BOOKING_TEMPLATE_KEYS.has(templateKey)) {
      if (bookingId) {
        router.push({
          pathname: "/(app)/(tabs)/bookings/[id]",
          params: { id: bookingId },
        });
      } else {
        router.push("/(app)/(tabs)/bookings");
      }
      return;
    }

    // Template-based pushes: any template with booking_id but no explicit type routing yet
    if (!type && bookingId) {
      router.push({
        pathname: "/(app)/(tabs)/bookings/[id]",
        params: { id: bookingId },
      });
      return;
    }

    switch (type) {
      case "on_demand_incoming":
        if (onDemandRequestId) {
          router.push({
            pathname: "/(app)/on-demand/incoming/[id]",
            params: { id: onDemandRequestId },
          });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        break;

      case "on_demand_expired":
      case "on_demand_cancelled":
        if (bookingId) {
          router.push({
            pathname: "/(app)/(tabs)/bookings/[id]",
            params: { id: bookingId },
          });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        break;

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
            pathname: "/(app)/(tabs)/bookings/[id]",
            params: { id: bookingId || genericId },
          });
        } else {
          router.push("/(app)/(tabs)/bookings");
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
          router.push("/(app)/(tabs)/bookings");
        }
        break;

      // Message notifications – open provider messaging
      case "new_message":
      case "chat_message":
        if (conversationId) {
          router.push({
            pathname: "/(app)/(tabs)/chats/[id]",
            params: { id: conversationId },
          });
        } else {
          router.push("/(app)/(tabs)/chats");
        }
        break;

      // Review notifications
      case "new_review":
      case "review_response":
        if (bookingId) {
          router.push({
            pathname: "/(app)/(tabs)/bookings/[id]",
            params: { id: bookingId },
          });
        } else {
          router.push("/(app)/(tabs)/more/reviews");
        }
        break;

      // Team notifications
      case "staff_schedule_change":
      case "team_update":
      case "staff_invitation":
        router.push("/(app)/(tabs)/more/team");
        break;

      case "custom_order_paid":
        if (bookingId) {
          router.push({
            pathname: "/(app)/(tabs)/bookings/[id]",
            params: { id: bookingId },
          });
        } else {
          router.push("/(app)/(tabs)/more/finance");
        }
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

      case "product_order_update":
      case "product_order_placed":
        if (productOrderId) {
          router.push(
            `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(productOrderId)}` as never,
          );
        } else {
          router.push("/(app)/(tabs)/more/orders-hub" as never);
        }
        break;

      case "product_return_requested":
        router.push("/(app)/(tabs)/more/orders-hub?tab=returns" as never);
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
  } catch (err) {
    // §Provider-audit 2026-04: route errors previously disappeared with no
    // trace. Capture them so we can observe bad payloads / broken routes
    // coming from push, then fall back to the notifications hub.
    captureError(err, { scope: "push_notifications:route", payload: data });
    try {
      router.push("/(app)/notifications");
    } catch {
      // best-effort fallback; do not re-throw from the push handler.
    }
  }
}

function usePushRegistration() {
  const { user } = useAuth();
  const { gate } = useNativePermissionsOnboardingGate();
  const registeredRef = useRef(false);
  const oneSignalInitKeyRef = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (lastUserIdRef.current !== userId) {
      registeredRef.current = false;
      oneSignalInitKeyRef.current = null;
      lastUserIdRef.current = userId;
    }
  }, [user]);

  // Fetch OneSignal app_id from backend
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
  }, [user]);

  // Initialize OneSignal and register device
  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;
    if (gate.phase === "loading") return;

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
        if (res.error) {
          if (isTransientApiFailure(res.error)) {
            addBreadcrumb(
              "Device register skipped (transient network)",
              "push_notifications",
              { code: res.error.code },
            );
          } else {
            captureError(new Error(`Device registration rejected: ${res.error.message}`), {
              scope: "push_notifications:device_register",
              code: res.error.code,
            });
          }
        } else {
          registeredRef.current = true;
        }
      } catch (err) {
        captureError(err, { scope: "push_notifications:device_register" });
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
          // Must match Supabase users.id — server targets pushes via external_id / include_aliases.
          OneSignal.login(user.id);

          OneSignal.Notifications.addEventListener(
            "click",
            (event: NotificationClickEvent) => {
              const raw = event.notification as unknown as {
                additionalData?: Record<string, unknown>;
                launchURL?: string;
              };
              const additionalData = raw.additionalData;
              const launchURL =
                typeof raw.launchURL === "string" && raw.launchURL.trim()
                  ? raw.launchURL.trim()
                  : "";
              const merged: Record<string, unknown> = {
                ...(additionalData ?? {}),
                ...(launchURL ? { url: launchURL, deep_link: launchURL } : {}),
              };
              if (Object.keys(merged).length > 0) {
                handleNotificationRoute(merged);
              }
            },
          );

          OneSignal.Notifications.addEventListener(
            "foregroundWillDisplay",
            (event: NotificationWillDisplayEvent) => {
              event.getNotification().display();
              // Vibrate for booking notifications to grab attention
              const gn = event.getNotification();
              const data =
                gn && typeof gn === "object" && "additionalData" in gn
                  ? (gn as { additionalData?: Record<string, unknown> }).additionalData
                  : undefined;
              const tKey = String(data?.template_key ?? data?.type ?? "");
              if (
                PROVIDER_BOOKING_TEMPLATE_KEYS.has(tKey) ||
                tKey === "new_booking" ||
                tKey === "booking_request"
              ) {
                if (Platform.OS !== "web") {
                  Vibration.vibrate([0, 400, 200, 400]);
                }
              }
            },
          );
        }

        if (gate.phase === "complete") {
          const earlySub = await OneSignal.User.pushSubscription.getIdAsync();
          if (gate.fromRestore || !earlySub) {
            await OneSignal.Notifications.requestPermission(false);
          }
        }

        const subId = await OneSignal.User.pushSubscription.getIdAsync();
        if (subId) {
          await registerWithBackend(subId);
        } else {
          const retry = setTimeout(async () => {
            try {
              const retryId =
                await OneSignal.User.pushSubscription.getIdAsync();
              if (retryId) await registerWithBackend(retryId);
            } catch {
              // ignore
            }
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
  }, [appId, user, gate]);

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
        const res = await api.post<{ registered?: boolean }>(
          "/api/me/devices",
          {
            player_id: id,
            platform,
            app_type: "provider",
          },
        );
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
