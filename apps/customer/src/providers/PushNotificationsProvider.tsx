/**
 * Push Notifications Provider – OneSignal
 * Fetches app_id from superadmin (GET /api/public/third-party-config?service=onesignal&app=customer).
 * Fallback: EXPO_PUBLIC_ONESIGNAL_APP_ID from env.
 * Registers device with POST /api/me/devices (onesignal_player_id = OneSignal subscription ID).
 * Handles notification tap deep links via expo-router.
 * Requires development build (not Expo Go).
 */
import { useEffect, useRef, useState } from "react";
import { AppState, Platform, View, Text, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import type { NotificationClickEvent, NotificationWillDisplayEvent } from "react-native-onesignal";
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
import { trackNotificationOpened } from "@/lib/analytics";
import { addBreadcrumb, captureError } from "@/lib/sentry";
import { isTransientApiFailure } from "@/lib/api-error";
import { navigateFromNotification, type Notification } from "@/lib/notifications";
import { emitNotificationBadgeRefresh } from "@/lib/notification-badge-events";

const SUBSCRIPTION_RETRY_DELAYS_MS = [3000, 10000, 30000];

function CustomerPushPermissionNudge() {
  const { user } = useAuth();
  const { gate } = useNativePermissionsOnboardingGate();
  const nudgeShownRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web" || !user || gate.phase === "loading") return;

    const check = async () => {
      try {
        const { getOneSignalPermissionAsync, getOneSignalSubscriptionId } = await import(
          "@/lib/onesignal-client"
        );
        const [permission, subId] = await Promise.all([
          getOneSignalPermissionAsync(),
          getOneSignalSubscriptionId(),
        ]);
        if (permission && subId) {
          nudgeShownRef.current = false;
          setVisible(false);
          return;
        }
        if (nudgeShownRef.current) {
          setVisible(true);
          return;
        }
        nudgeShownRef.current = true;
        setVisible(true);
      } catch {
        // ignore
      }
    };

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    void check();
    return () => sub.remove();
  }, [user, gate.phase]);

  if (!visible) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#EFF6FF",
        borderBottomWidth: 1,
        borderBottomColor: "#BFDBFE",
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Text style={{ flex: 1, fontSize: 13, color: "#1E3A8A", marginRight: 8 }} numberOfLines={2}>
        Push notifications are off. Turn them on to get booking and message alerts.
      </Text>
      <TouchableOpacity
        onPress={() => router.push("/(app)/account-settings/notifications" as never)}
        style={{ backgroundColor: "#1D4ED8", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Open notification settings"
      >
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Deep link from a push — same rules as the in-app notification list
 * (navigateFromNotification) so banners and the bell land on the same screens.
 */
function handleNotificationRoute(
  data: Record<string, unknown>,
  opts?: { launchUrl?: string; title?: string; body?: string }
) {
  try {
    const notif = data;
    const type = String(
      notif.type ?? notif.notification_type ?? notif.template_key ?? notif.push_type ?? ""
    );
    const id = String(
      notif.id ?? notif.booking_id ?? notif.bookingId ?? notif.chat_id ?? notif.conversation_id ?? notif.post_id ?? ""
    );
    addBreadcrumb("Notification tapped", "notification", { type, id });
    trackNotificationOpened(type, data);

    const link =
      opts?.launchUrl ??
      (typeof notif.url === "string" ? notif.url : undefined) ??
      (typeof notif.link === "string" ? notif.link : undefined) ??
      (typeof notif.action_url === "string" ? notif.action_url : undefined) ??
      (typeof notif.deep_link === "string" ? notif.deep_link : undefined);

    const n: Notification = {
      id: String(notif.id ?? notif.notification_id ?? "push"),
      type,
      title: opts?.title ?? String(notif.title ?? ""),
      message: opts?.body ?? String(notif.message ?? notif.body ?? notif.alert ?? ""),
      is_read: true,
      created_at: new Date().toISOString(),
      data: { ...data },
      link: link || undefined,
      action_url: link || undefined,
    };
    navigateFromNotification(n);
    // Mark the related in-app rows read so the bell + OS badge decrement now.
    markPushNotificationRead(data);
  } catch {
    // Silently fail on routing errors
  }
}

/**
 * When a push is tapped, mark the related in-app notification rows read on the
 * server so the bell + OS badge decrement immediately (previously the synthetic
 * `is_read: true` was local-only and the count stayed inflated until the user
 * opened the list). Server route also pushes a badge_sync to all devices; we
 * additionally emit a local badge refresh for instant in-app context update.
 * Best-effort: never throws.
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
        await api.post(`/api/me/notifications/${notificationId}/read`, {});
      }
      if (Object.keys(body).length > 0) {
        await api.post("/api/me/notifications/mark-related-read", body);
      }
    } catch {
      // Non-blocking — the badge will reconcile on next realtime/foreground sync.
    } finally {
      emitNotificationBadgeRefresh();
    }
  })();
}

function usePushRegistration() {
  const { user } = useAuth();
  const { gate } = useNativePermissionsOnboardingGate();
  const registeredRef = useRef(false);
  const lastRegisteredPlayerIdRef = useRef<string | null>(null);
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
      lastRegisteredPlayerIdRef.current = null;
      oneSignalInitKeyRef.current = null;
      lastUserIdRef.current = nextUserId;
    }
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web" || !user) return;

    let cancelled = false;
    void resolveOneSignalAppId().then((id) => {
      if (!cancelled) setAppId(id);
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run when user id available
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const ready = Boolean(user?.id) && gate.phase !== "loading";
    setPushNavigationReady(ready);
    if (ready) {
      flushPendingPushNotification((payload) => handleNotificationRoute(payload));
    }
    return () => {
      if (!ready) setPushNavigationReady(false);
    };
  }, [user?.id, gate.phase]);

  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;
    if (gate.phase === "loading") return;

    const registerWithBackend = async (playerId: string, source: string) => {
      const normalizedPlayerId = playerId.trim();
      if (!normalizedPlayerId) return;
      if (registeredRef.current && lastRegisteredPlayerIdRef.current === normalizedPlayerId) return;
      try {
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await api.post<{ registered?: boolean }>("/api/me/devices", {
          player_id: normalizedPlayerId,
          platform,
          app_type: "customer",
        });
        if (!res.error) {
          registeredRef.current = true;
          lastRegisteredPlayerIdRef.current = normalizedPlayerId;
          void setRegisteredPlayerId(user.id, normalizedPlayerId);
        } else if (isTransientApiFailure(res.error)) {
          // The POST often gets torn down on resume after the app was suspended
          // mid-flight (iOS freezes the request, the 30s timeout fires overdue →
          // TIMEOUT/CANCELLED). The foreground re-register effect retries, so
          // keep a breadcrumb instead of spamming Sentry with a false error.
          addBreadcrumb("Device register skipped (transient network)", "push_notifications", {
            code: res.error.code,
            source,
          });
        } else {
          captureError(new Error(`Device registration rejected: ${res.error.message}`), {
            scope: "push_notifications:device_register",
            code: res.error.code,
            source,
          });
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

          OneSignal.Notifications.addEventListener("click", (event: NotificationClickEvent) => {
            const additionalData = (event.notification.additionalData ?? {}) as Record<string, unknown>;
            const raw = event.notification as {
              launchUrl?: string;
              launchURL?: string;
              title?: string;
              body?: string;
            };
            const launchUrl =
              typeof raw.launchUrl === "string"
                ? raw.launchUrl
                : typeof raw.launchURL === "string"
                  ? raw.launchURL
                  : undefined;
            const merged: Record<string, unknown> = {
              ...additionalData,
              ...(launchUrl ? { url: launchUrl, deep_link: launchUrl } : {}),
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
            enqueueOrRoutePushNotification(merged, (payload) =>
              handleNotificationRoute(payload, {
                launchUrl,
                title: raw.title,
                body: raw.body,
              }),
            );
          });

          // Show in the shade while open; re-sync bell + app-icon badge from server (single source of truth).
          OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: NotificationWillDisplayEvent) => {
            const data = (event.notification.additionalData ?? {}) as Record<string, unknown>;
            if (data.type === "badge_sync") {
              event.preventDefault();
              emitNotificationBadgeRefresh();
              return;
            }
            event.getNotification().display();
            emitNotificationBadgeRefresh();
          });
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

        // Preserve explicit onboarding skips. Only legacy restored installs get an automatic compatibility prompt.
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
              const id = await getOneSignalSubscriptionId();
                if (id) await registerWithBackend(id, `retry_${delay}`);
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
      } catch (err) {
        captureError(err instanceof Error ? err : new Error("OneSignal init failed"), {
          scope: "push_notifications:onesignal_init",
        });
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
    let timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const tryRegister = async () => {
      if (cancelled || registeredRef.current) return;
      try {
        const id = await getOneSignalSubscriptionId();
        if (!id || cancelled || registeredRef.current) return;
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await api.post<{ registered?: boolean }>("/api/me/devices", {
          player_id: id,
          platform,
          app_type: "customer",
        });
        if (!res.error) {
          registeredRef.current = true;
          lastRegisteredPlayerIdRef.current = id.trim();
          // Persist so the foreground re-register effect sees this id as
          // already-registered and doesn't re-POST /api/me/devices on next focus.
          void setRegisteredPlayerId(user.id, id.trim());
        } else if (isTransientApiFailure(res.error)) {
          // Backgrounded mutation torn down on resume — the foreground
          // re-register effect retries; don't surface a false error.
          addBreadcrumb("Device register skipped (transient network)", "push_notifications", {
            code: res.error.code,
          });
        } else {
          captureError(new Error(`Device registration rejected: ${res.error.message}`), {
            scope: "push_notifications:device_register",
            code: res.error.code,
          });
        }
      } catch (err) {
        captureError(err, { scope: "push_notifications:device_register" });
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
          const res = await api.post<{ registered?: boolean }>("/api/me/devices", {
            player_id: id,
            platform,
            app_type: "customer",
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

    // If user was logged in and now logged out
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
            await api.fetch("/api/me/devices", {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- track user for logout cleanup
  }, [user?.id]);
}

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  usePushRegistration();
  useOneSignalLogout();
  return (
    <>
      <CustomerPushPermissionNudge />
      {children}
    </>
  );
}
