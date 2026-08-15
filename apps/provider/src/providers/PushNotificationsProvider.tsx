/**
 * Push Notifications Provider – OneSignal (Provider App)
 * Fetches app_id from superadmin (GET /api/public/third-party-config?service=onesignal).
 * Fallback: EXPO_PUBLIC_ONESIGNAL_APP_ID from env.
 * Registers device with POST /api/provider/devices (onesignal_player_id = OneSignal subscription ID).
 * Handles notification tap deep links via expo-router.
 * Notification templates are configured from the superadmin portal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, DeviceEventEmitter, Platform, Vibration } from "react-native";
import { router } from "expo-router";
import type {
  NotificationClickEvent,
  NotificationWillDisplayEvent,
} from "react-native-onesignal";
import { useAuth } from "@/providers/AuthProvider";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
import {
  PROVIDER_ROLE_CHANGED_EVENT,
  type ProviderRoleChangedPayload,
} from "@/lib/provider-role-events";
import { api } from "@/lib/api-client";
import {
  clearPendingPushNotification,
  clearRegisteredPlayerId,
  ensureOneSignalExternalId,
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
import {
  applyProviderNotificationRoute,
  PROVIDER_BOOKING_TEMPLATE_KEYS,
} from "@/lib/resolveProviderNotificationRoute";
import { navigateFromProviderNotification } from "@/lib/provider-notification-navigation";
import { useInAppBanner } from "@/providers/InAppBannerProvider";

/** Suppress duplicate foreground banners within this window (ms). */
const RECENT_FG_PUSH_TTL_MS = 10_000;
const recentForegroundPushes = new Map<string, number>();

function buildForegroundPushDedupeKey(
  gn: unknown,
  data: Record<string, unknown> | undefined,
): string | null {
  const notif = gn as {
    collapseId?: string;
    notificationId?: string;
    title?: string;
    body?: string;
  } | null;
  const collapseId =
    (typeof notif?.collapseId === "string" && notif.collapseId.trim()) ||
    (typeof data?.collapse_id === "string" && data.collapse_id.trim()) ||
    (typeof data?.group_id === "string" && data.group_id.trim()) ||
    "";
  if (collapseId) return `collapse:${collapseId}`;
  const notifId =
    (typeof notif?.notificationId === "string" && notif.notificationId.trim()) ||
    (typeof data?.notification_id === "string" && data.notification_id.trim()) ||
    "";
  const title = String(notif?.title ?? "");
  const body = String(notif?.body ?? "");
  if (notifId || title || body) {
    return `content:${notifId}|${title}|${body}`;
  }
  return null;
}

function shouldSkipDuplicateForegroundPush(
  gn: unknown,
  data: Record<string, unknown> | undefined,
): boolean {
  const key = buildForegroundPushDedupeKey(gn, data);
  if (!key) return false;
  const now = Date.now();
  const seenAt = recentForegroundPushes.get(key);
  if (seenAt != null && now - seenAt < RECENT_FG_PUSH_TTL_MS) {
    return true;
  }
  recentForegroundPushes.set(key, now);
  for (const [k, t] of recentForegroundPushes) {
    if (now - t >= RECENT_FG_PUSH_TTL_MS) recentForegroundPushes.delete(k);
  }
  return false;
}

/** Suppress visible banner for silent OS badge sync (including legacy in-flight payloads). */
function isBadgeSyncPushData(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  if (d.type === "badge_sync") return true;
  return d.silent === true && typeof d.unread_count === "number";
}

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

const SUBSCRIPTION_RETRY_DELAYS_MS = [3000, 10000, 30000];

function handleNotificationRoute(data: Record<string, unknown>) {
  markPushNotificationRead(data);
  const routed = applyProviderNotificationRoute(router, data);
  if (!routed) {
    const navPayload = {
      id: String(data.notification_id ?? data.id ?? ""),
      type: String(data.type ?? data.template_key ?? ""),
      data,
      link: String(data.url ?? data.action_url ?? ""),
      action_url: String(data.action_url ?? data.url ?? ""),
    };
    if (navigateFromProviderNotification(router, navPayload)) return;
    router.push("/(app)/notifications");
  }
}

function PushPermissionMonitor() {
  const { show } = useInAppBanner();
  const nudgeShownRef = useRef(false);
  const { user } = useAuth();
  const { gate } = useNativePermissionsOnboardingGate();

  useEffect(() => {
    if (Platform.OS === "web" || !user || gate.phase === "loading") return;

    const check = async () => {
      try {
        // Gate on the OS source of truth via expo-notifications (same call the
        // notification-preferences screen uses). Unlike OneSignal's
        // getPermissionAsync(), this needs no SDK init, so a cold-start check
        // can't fire a false "push off" nudge before OneSignal initializes.
        const Notifications = await import("expo-notifications");
        const { status } = await Notifications.getPermissionsAsync();
        if (status === "granted") {
          nudgeShownRef.current = false;
          return;
        }
        if (nudgeShownRef.current) return;
        nudgeShownRef.current = true;
        show({
          icon: "notifications-off-outline",
          title: "Push notifications off",
          message: "Tap to allow notifications so you never miss a booking.",
          tone: "info",
          durationMs: 6000,
          onPress: () => {
            // Resolve the OS-level permission directly: requestPermission(true)
            // shows the native prompt when undetermined and falls back to the
            // system Settings page when already denied. Routing to the in-app
            // preference toggles (which are server-stored and look "on") just
            // confused users about why push wasn't arriving.
            void import("@/lib/onesignal-client").then(({ requestOneSignalPushPermission }) => {
              void requestOneSignalPushPermission(true).finally(() => {
                nudgeShownRef.current = false;
              });
            });
          },
        });
      } catch {
        // ignore
      }
    };

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    // Re-check the moment OS permission flips so a stale "push off" nudge can't
    // linger after the user grants permission while the app stays foregrounded.
    let removePermissionObserver: (() => void) | undefined;
    void import("@/lib/onesignal-client").then(({ addOneSignalPermissionObserver }) => {
      removePermissionObserver = addOneSignalPermissionObserver(() => void check());
    });
    void check();
    return () => {
      sub.remove();
      removePermissionObserver?.();
    };
  }, [user, gate.phase, show]);

  return null;
}

function usePushRegistration() {
  const { user } = useAuth();
  const { gate } = useNativePermissionsOnboardingGate();
  // This provider is mounted at the root layout, ABOVE the authenticated
  // `ProviderProvider`, so it cannot call `useProvider()` (that throws and
  // stalls the app on the splash screen). Instead we mirror the role via the
  // `PROVIDER_ROLE_CHANGED_EVENT` broadcast emitted by `ProviderContext`.
  const [role, setRole] = useState<string | null>(null);
  const roleRef = useRef<string | null>(null);
  const registeredRef = useRef(false);
  const lastRegisteredPlayerIdRef = useRef<string | null>(null);
  const oneSignalInitKeyRef = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  /**
   * The role that `/api/provider/devices` rejected, wrapped so that "rejected
   * while the role was still unknown" (`{ role: null }`) stays distinct from
   * "never rejected" (`null`).
   *
   * Keyed on the rejected role rather than on a list of accepted roles: the route
   * also accepts `provider_onboarding`, so gating retries on
   * `isProviderApiRole()` would leave a signup that first failed as `customer`
   * unable to register for the whole onboarding and pending-approval phase.
   * Any role change is enough to justify one more attempt.
   */
  const registerRejectedForRoleRef = useRef<{ role: string | null } | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const userId = user?.id ?? null;

  /**
   * The only path to POST /api/provider/devices. That route is role-gated, so it
   * can reject for part of the onboarding wizard — every retry timer below
   * funnels through here so a single rejection latches them all off until the
   * role changes. Previously each timer POSTed directly and kept retrying a
   * request that could not succeed.
   */
  const registerDevice = useCallback(
    async (playerId: string, source: string): Promise<void> => {
      if (!userId) return;
      const normalizedPlayerId = playerId.trim();
      if (!normalizedPlayerId) return;
      if (registeredRef.current && lastRegisteredPlayerIdRef.current === normalizedPlayerId) return;
      const rejected = registerRejectedForRoleRef.current;
      if (rejected && rejected.role === roleRef.current) return;
      try {
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await api.post<{ registered?: boolean }>("/api/provider/devices", {
          player_id: normalizedPlayerId,
          platform,
        });
        if (!res.error) {
          registeredRef.current = true;
          lastRegisteredPlayerIdRef.current = normalizedPlayerId;
          void setRegisteredPlayerId(userId, normalizedPlayerId);
          return;
        }
        const status = (res.error as { status?: number }).status;
        if (status === 401 || status === 403) {
          // During fresh provider signup the user stays `customer` until
          // onboarding upgrades the role. Defer rather than retry.
          const alreadyDeferred = registerRejectedForRoleRef.current !== null;
          registerRejectedForRoleRef.current = { role: roleRef.current };
          if (!alreadyDeferred) {
            addBreadcrumb("Device register deferred (role not ready)", "push_notifications", {
              code: res.error.code,
              role: roleRef.current,
              source,
              status,
            });
          }
          return;
        }
        const code = res.error.code;
        const transient = isTransientApiFailure(res.error) && code !== "DEVICE_REGISTRATION_FAILED";
        if (transient) {
          addBreadcrumb("Device register skipped (transient network)", "push_notifications", {
            code,
          });
        } else {
          captureError(new Error(`Device registration rejected: ${res.error.message}`), {
            scope: "push_notifications:device_register",
            code,
            source,
            status,
          });
        }
      } catch (err) {
        captureError(err, { scope: "push_notifications:device_register", source });
      }
    },
    [userId],
  );

  // Mirror the provider role broadcast by `ProviderContext`. ProviderContext is
  // mounted below this provider, so role updates always arrive after this
  // listener is registered (the role is resolved asynchronously post-auth).
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      PROVIDER_ROLE_CHANGED_EVENT,
      (payload: ProviderRoleChangedPayload) => {
        const next = payload?.role ?? null;
        roleRef.current = next;
        setRole(next);
      },
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (lastUserIdRef.current !== userId) {
      registeredRef.current = false;
      lastRegisteredPlayerIdRef.current = null;
      oneSignalInitKeyRef.current = null;
      registerRejectedForRoleRef.current = null;
      lastUserIdRef.current = userId;
    }
  }, [userId]);

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
              if (isBadgeSyncPushData(data)) {
                event.preventDefault();
                emitNotificationBadgeRefresh();
                return;
              }
              if (shouldSkipDuplicateForegroundPush(gn, data)) {
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
          await registerDevice(nextId, "subscription_change");
          // The subscription now exists — re-assert external-id binding so
          // alias-targeted pushes reach this exact identity (not just broadcasts).
          if (user) await ensureOneSignalExternalId(user.id);
        };
        OneSignal.User.pushSubscription.addEventListener("change", onPushSubscriptionChange);

        if (gate.phase === "complete") {
          // Returning users without a subscription should enable push via
          // settings or the permission nudge — avoid a surprise hard OS prompt.
          await getOneSignalSubscriptionId();
        }

        const subId = await getOneSignalSubscriptionId();
        if (subId) {
          await registerDevice(subId, "initial_subscription");
        } else {
          SUBSCRIPTION_RETRY_DELAYS_MS.forEach((delay) => {
            const timeoutId = setTimeout(async () => {
            try {
              const retryId = await getOneSignalSubscriptionId();
                if (retryId) await registerDevice(retryId, `retry_${delay}`);
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
  }, [appId, user, gate, registerDevice]);

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
        await registerDevice(id, "post_onboarding_gate");
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
  }, [appId, user, gate, registerDevice]);

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
          // Heal a mis-bound external id on foreground (covers the case where the
          // initial login raced ahead of subscription creation).
          await ensureOneSignalExternalId(uid);
          const id = await getOneSignalSubscriptionId();
          if (!id) return;
          if (lastRegisteredPlayerIdRef.current === id) return;
          const persisted = await getRegisteredPlayerId(uid);
          if (persisted === id) {
            lastRegisteredPlayerIdRef.current = id;
            registeredRef.current = true;
            return;
          }
          await registerDevice(id, "foreground_reregister");
        } catch (err) {
          captureError(err, { scope: "push_notifications:foreground_reregister" });
        }
      })();
    });
    return () => sub.remove();
  }, [appId, user, gate, registerDevice]);

  // Registration was rejected for the previous role — re-arm it now that the
  // role has changed, since the new one may well be accepted.
  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;
    const rejected = registerRejectedForRoleRef.current;
    if (!rejected || rejected.role === role) return;
    registerRejectedForRoleRef.current = null;
    void (async () => {
      try {
        await ensureOneSignalInitialized(appId, user.id);
        const id = await getOneSignalSubscriptionId();
        if (id) {
          await registerDevice(id, "role_upgrade_retry");
        }
      } catch {
        // Non-fatal; foreground re-register will retry.
      }
    })();
  }, [appId, user, role, registerDevice]);
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
  return (
    <>
      <PushPermissionMonitor />
      {children}
    </>
  );
}
