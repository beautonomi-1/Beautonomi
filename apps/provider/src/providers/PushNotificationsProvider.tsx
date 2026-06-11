/**
 * Push Notifications Provider – OneSignal (Provider App)
 * Fetches app_id from superadmin (GET /api/public/third-party-config?service=onesignal).
 * Fallback: EXPO_PUBLIC_ONESIGNAL_APP_ID from env.
 * Registers device with POST /api/provider/devices (onesignal_player_id = OneSignal subscription ID).
 * Handles notification tap deep links via expo-router.
 * Notification templates are configured from the superadmin portal.
 */
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Vibration } from "react-native";
import { router } from "expo-router";
import type {
  NotificationClickEvent,
  NotificationWillDisplayEvent,
} from "react-native-onesignal";
import { useAuth } from "@/providers/AuthProvider";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
import { api } from "@/lib/api-client";
import {
  clearPendingPushNotification,
  clearRegisteredPlayerId,
  ensureOneSignalInitialized,
  enqueueOrRoutePushNotification,
  flushPendingPushNotification,
  getOneSignalSubscriptionId,
  getRegisteredPlayerId,
  logoutOneSignal,
  resolveOneSignalAppId,
  setPushNavigationReady,
  setRegisteredPlayerId,
} from "@/lib/onesignal-client";
import { captureError, addBreadcrumb } from "@/lib/sentry";
import { isTransientApiFailure } from "@/lib/api-error";
import { emitNotificationBadgeRefresh } from "@/lib/notification-badge-events";

const SUBSCRIPTION_RETRY_DELAYS_MS = [3000, 10000, 30000];

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
 * When a push is tapped, mark the related in-app notification rows read on the
 * server so the bell + OS badge decrement immediately. Best-effort; never throws.
 */
function markPushNotificationRead(data: Record<string, unknown>): void {
  if (Platform.OS === "web") return;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;

  const notificationId = str(data.notification_id);

  const body: Record<string, string> = {};
  const bookingId = str(data.booking_id) ?? str(data.bookingId);
  if (bookingId) body.booking_id = bookingId;
  const conversationId = str(data.conversation_id) ?? str(data.chat_id);
  if (conversationId) body.conversation_id = conversationId;
  const orderId = str(data.order_id) ?? str(data.product_order_id);
  if (orderId) body.order_id = orderId;
  const ticketId = str(data.ticket_id);
  if (ticketId) body.ticket_id = ticketId;
  const paymentId = str(data.payment_id);
  if (paymentId) body.payment_id = paymentId;

  void (async () => {
    try {
      if (notificationId) {
        await api.post(`/api/provider/notifications/${notificationId}/read`, {});
      }
      if (Object.keys(body).length > 0) {
        await api.post("/api/provider/notifications/mark-related-read", body);
      }
    } catch {
      // Non-blocking — the badge reconciles on next realtime/foreground sync.
    } finally {
      emitNotificationBadgeRefresh();
    }
  })();
}

/**
 * Route to the correct screen based on notification payload.
 * Deep links map to provider-specific screens.
 * Supports: type, template_key, booking_id, client_id, conversation_id (or chat_id), etc.
 */
function handleNotificationRoute(data: Record<string, unknown>) {
  // Mark related in-app rows read up front (fire-and-forget) so every routing
  // branch below benefits without duplicating the call.
  markPushNotificationRead(data);
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
    const actionUrl = String(data.action_url ?? data.link ?? data.url ?? data.deep_link ?? "").trim();
    const actionUrlLc = actionUrl.toLowerCase();
    const typeLc = type.toLowerCase();
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

    if (
      typeLc === "ads_payment_confirmed" ||
      actionUrlLc.includes("/provider/settings/ads") ||
      actionUrlLc.includes("settings/ads")
    ) {
      router.push("/(app)/(tabs)/more/settings/ads" as never);
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
      router.push("/(app)/(tabs)/more/time-blocks");
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
            pathname: "/(app)/(tabs)/clients/[id]",
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

      case "paystack_terminal_payment":
      case "provider_paystack_terminal_payment":
        router.push("/(app)/(tabs)/more/paystack-terminal" as never);
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
  const lastRegisteredPlayerIdRef = useRef<string | null>(null);
  const oneSignalInitKeyRef = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (lastUserIdRef.current !== userId) {
      registeredRef.current = false;
      lastRegisteredPlayerIdRef.current = null;
      oneSignalInitKeyRef.current = null;
      lastUserIdRef.current = userId;
    }
  }, [user?.id]);

  // Resolve OneSignal app id (superadmin config with env fallback).
  useEffect(() => {
    if (Platform.OS === "web" || !user) return;

    let cancelled = false;
    void resolveOneSignalAppId().then((id) => {
      if (!cancelled) setAppId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Cold-start taps can fire before the authenticated router is mounted.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const ready = Boolean(user?.id) && gate.phase !== "loading";
    setPushNavigationReady(ready);
    if (ready) {
      flushPendingPushNotification(handleNotificationRoute);
    }
    return () => {
      if (!ready) setPushNavigationReady(false);
    };
  }, [user?.id, gate.phase]);

  // Initialize OneSignal and register device
  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;
    if (gate.phase === "loading") return;

    const registerWithBackend = async (playerId: string, source: string) => {
      const normalizedPlayerId = playerId.trim();
      if (!normalizedPlayerId) return;
      if (registeredRef.current && lastRegisteredPlayerIdRef.current === normalizedPlayerId) return;
      try {
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await api.post<{ registered?: boolean }>(
          "/api/provider/devices",
          {
            player_id: normalizedPlayerId,
            platform,
          },
        );
        if (res.error) {
          const status = (res.error as { status?: number }).status;
          if (status === 401 || status === 403) {
            // During fresh provider signup the user can still be `customer` until
            // onboarding completes/upgrades role. Skip noisy hard errors here.
            addBreadcrumb(
              "Device register skipped (role not ready)",
              "push_notifications",
              { code: res.error.code, source, status },
            );
            return;
          }
          const code = res.error.code;
          const transient =
            isTransientApiFailure(res.error) &&
            code !== "DEVICE_REGISTRATION_FAILED";
          if (transient) {
            addBreadcrumb(
              "Device register skipped (transient network)",
              "push_notifications",
              { code },
            );
          } else {
            captureError(new Error(`Device registration rejected: ${res.error.message}`), {
              scope: "push_notifications:device_register",
              code,
              source,
              status,
            });
          }
        } else {
          registeredRef.current = true;
          lastRegisteredPlayerIdRef.current = normalizedPlayerId;
          void setRegisteredPlayerId(user.id, normalizedPlayerId);
        }
      } catch (err) {
        captureError(err, { scope: "push_notifications:device_register", source });
      }
    };

    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        const { OneSignal } = await import("react-native-onesignal");
        const retryTimeoutIds: ReturnType<typeof setTimeout>[] = [];

        await ensureOneSignalInitialized(appId, user.id);

        const sessionKey = `${user.id}:${appId}`;
        const isFirstInitForSession = oneSignalInitKeyRef.current !== sessionKey;
        if (isFirstInitForSession) {
          oneSignalInitKeyRef.current = sessionKey;

          OneSignal.Notifications.addEventListener(
            "click",
            (event: NotificationClickEvent) => {
              const raw = event.notification as unknown as {
                additionalData?: Record<string, unknown>;
                launchUrl?: string;
                launchURL?: string;
              };
              const additionalData = raw.additionalData;
              const launchURL =
                (typeof raw.launchURL === "string" && raw.launchURL.trim()
                  ? raw.launchURL.trim()
                  : "") ||
                (typeof raw.launchUrl === "string" && raw.launchUrl.trim()
                  ? raw.launchUrl.trim()
                  : "");
              const merged: Record<string, unknown> = {
                ...(additionalData ?? {}),
                ...(launchURL ? { url: launchURL, deep_link: launchURL } : {}),
              };
              // iOS/Android action-button taps surface here as result.actionId.
              const actionId = String(
                (event as unknown as { result?: { actionId?: string } }).result?.actionId ?? "",
              );
              if (actionId === "mark_read") {
                // "Mark as read" doesn't open the app — just clear it server-side.
                markPushNotificationRead(merged);
                return;
              }
              // accept_booking / decline_booking open the booking detail (which
              // has the confirm/decline controls), in addition to default taps.
              if (Object.keys(merged).length > 0) {
                enqueueOrRoutePushNotification(merged, handleNotificationRoute);
              } else {
                enqueueOrRoutePushNotification({}, () => router.push("/(app)/notifications"));
              }
            },
          );

          OneSignal.Notifications.addEventListener(
            "foregroundWillDisplay",
            (event: NotificationWillDisplayEvent) => {
              const gn = event.getNotification();
              const data =
                gn && typeof gn === "object" && "additionalData" in gn
                  ? (gn as { additionalData?: Record<string, unknown> }).additionalData
                  : undefined;
              if (data?.type === "badge_sync") {
                event.preventDefault();
                emitNotificationBadgeRefresh();
                return;
              }
              event.getNotification().display();
              emitNotificationBadgeRefresh();
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

        const onPushSubscriptionChange = async (event: unknown) => {
          const evt = event as {
            current?: { id?: string | null; token?: string | null };
            subscription?: { id?: string | null; token?: string | null };
          };
          const nextId =
            evt?.current?.id?.trim() ||
            evt?.subscription?.id?.trim() ||
            evt?.current?.token?.trim() ||
            evt?.subscription?.token?.trim() ||
            "";
          if (!nextId) return;
          await registerWithBackend(nextId, "subscription_change");
        };
        OneSignal.User.pushSubscription.addEventListener("change", onPushSubscriptionChange);

        if (gate.phase === "complete") {
          const earlySub = await getOneSignalSubscriptionId();
          if (gate.fromRestore && !earlySub) {
            await OneSignal.Notifications.requestPermission(false);
          }
        }

        const subId = await getOneSignalSubscriptionId();
        if (subId) {
          await registerWithBackend(subId, "initial_subscription");
        } else {
          SUBSCRIPTION_RETRY_DELAYS_MS.forEach((delay) => {
            const timeoutId = setTimeout(async () => {
            try {
              const retryId = await getOneSignalSubscriptionId();
                if (retryId) await registerWithBackend(retryId, `retry_${delay}`);
            } catch {
              // ignore
            }
            }, delay);
            retryTimeoutIds.push(timeoutId);
          });
        }
        unsubscribe = () => {
          retryTimeoutIds.forEach(clearTimeout);
          OneSignal.User.pushSubscription.removeEventListener("change", onPushSubscriptionChange);
        };
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
    let timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const tryRegister = async () => {
      if (cancelled || registeredRef.current) return;
      try {
        await import("react-native-onesignal");
        const id = await getOneSignalSubscriptionId();
        if (!id || cancelled || registeredRef.current) return;
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await api.post<{ registered?: boolean }>(
          "/api/provider/devices",
          {
            player_id: id,
            platform,
          },
        );
        if (!res.error) {
          registeredRef.current = true;
          lastRegisteredPlayerIdRef.current = id.trim();
          // Persist so the foreground re-register effect treats this id as
          // already-registered and doesn't re-POST /api/provider/devices.
          void setRegisteredPlayerId(user.id, id.trim());
        }
      } catch (err) {
        captureError(err, { scope: "push_notifications:device_register_retry" });
      }
    };

    void tryRegister();
    timeoutIds = [2500, 10000, 30000].map((delay) => setTimeout(tryRegister, delay));

    return () => {
      cancelled = true;
      timeoutIds.forEach(clearTimeout);
    };
  }, [appId, user, gate]);

  // §Push-reliability: re-check the subscription on every foreground. The OS can
  // rotate the OneSignal subscription id while the app is backgrounded, and an
  // earlier registration may have failed silently (offline at launch). Ensure
  // login(userId) is applied first, then register only when the id changed since
  // our last successful registration (in-memory or persisted) to avoid spamming
  // the endpoint on every focus.
  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;
    if (gate.phase === "loading") return;
    const uid = user.id;

    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        try {
          await ensureOneSignalInitialized(appId, uid);
          const id = await getOneSignalSubscriptionId();
          if (!id) return;
          if (lastRegisteredPlayerIdRef.current === id) return;
          const persisted = await getRegisteredPlayerId(uid);
          if (persisted === id) {
            lastRegisteredPlayerIdRef.current = id;
            registeredRef.current = true;
            return;
          }
          const platform = Platform.OS === "ios" ? "ios" : "android";
          const res = await api.post<{ registered?: boolean }>("/api/provider/devices", {
            player_id: id,
            platform,
          });
          if (!res.error) {
            registeredRef.current = true;
            lastRegisteredPlayerIdRef.current = id;
            void setRegisteredPlayerId(uid, id);
          }
        } catch (err) {
          captureError(err, { scope: "push_notifications:foreground_reregister" });
        }
      })();
    });
    return () => sub.remove();
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
      clearPendingPushNotification();
      setPushNavigationReady(false);
      void clearRegisteredPlayerId();
      void (async () => {
        try {
          const Notifications = await import("expo-notifications");
          await Notifications.setBadgeCountAsync(0);
        } catch {
          // Native module unavailable
        }
        try {
          const playerId = await logoutOneSignal();
          if (playerId) {
            await api.fetch("/api/provider/devices", {
              method: "DELETE",
              body: { player_id: playerId },
            });
          }
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
