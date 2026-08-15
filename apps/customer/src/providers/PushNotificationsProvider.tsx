/**
 * Push Notifications Provider – OneSignal
 * Fetches app_id from superadmin (GET /api/public/third-party-config?service=onesignal&app=customer).
 * Fallback: EXPO_PUBLIC_ONESIGNAL_APP_ID from env.
 * Registers device with POST /api/me/devices (onesignal_player_id = OneSignal subscription ID).
 * Handles notification tap deep links via expo-router.
 * Requires development build (not Expo Go).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, View, Text, TouchableOpacity } from "react-native";
import { usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "@beautonomi/i18n";
import type { NotificationClickEvent, NotificationWillDisplayEvent } from "react-native-onesignal";
import { useAuth } from "@/providers/AuthProvider";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
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
import { trackNotificationOpened } from "@/lib/analytics";
import { addBreadcrumb, captureError } from "@/lib/sentry";
import { isTransientApiFailure } from "@/lib/api-error";
import { navigateFromNotification, type Notification } from "@/lib/notifications";
import { emitNotificationBadgeRefresh } from "@/lib/notification-badge-events";

/** Suppress visible banner for silent OS badge sync (including legacy in-flight payloads). */
function isBadgeSyncPushData(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  if (d.type === "badge_sync") return true;
  return d.silent === true && typeof d.unread_count === "number";
}

const SUBSCRIPTION_RETRY_DELAYS_MS = [3000, 10000, 30000];

/** Don't re-nag for a week after the user explicitly dismisses the nudge. */
const PUSH_NUDGE_DISMISSED_KEY = "beautonomi.pushNudgeDismissedAt.v1";
const PUSH_NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Persistent, safe-area-aware banner shown when OS-level push permission is off
 * (i.e. the device can't receive push at all). The CTA resolves the *system*
 * permission directly — `requestPermission(true)` shows the native prompt when
 * undetermined and falls back to the OS Settings page when already denied — so
 * tapping it actually fixes the blocker instead of opening the in-app preference
 * toggles (which are server-stored and look "on", causing the classic
 * app-vs-OS confusion).
 */
function CustomerPushPermissionNudge() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { gate } = useNativePermissionsOnboardingGate();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  // The notification settings screen renders its own prominent "system off"
  // banner, so suppress the global one there to avoid duplicate prompts.
  const onNotificationSettings = (pathname ?? "").includes("account-settings/notifications");

  const check = useCallback(async () => {
    if (Platform.OS === "web" || !user || gate.phase === "loading") {
      setVisible(false);
      return;
    }
    try {
      // Gate on the OS source of truth via expo-notifications — the SAME call
      // the in-app notification settings screen uses. Unlike OneSignal's
      // getPermissionAsync(), this needs no SDK init, so a cold-start check can
      // never produce a false "notifications are off" before OneSignal has
      // finished initializing (the previous bug: the banner showed even when OS
      // permission was granted, and only cleared after a background round-trip).
      const Notifications = await import("expo-notifications");
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") {
        setVisible(false);
        return;
      }
      // Respect a recent manual dismissal so the banner isn't naggy.
      try {
        const raw = await AsyncStorage.getItem(PUSH_NUDGE_DISMISSED_KEY);
        const dismissedAt = raw ? Number(raw) : 0;
        if (dismissedAt && Date.now() - dismissedAt < PUSH_NUDGE_COOLDOWN_MS) {
          setVisible(false);
          return;
        }
      } catch {
        // ignore storage failures; fall through to show the nudge
      }
      setVisible(true);
    } catch {
      // ignore
    }
  }, [user, gate.phase]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    // Re-check the instant OS permission flips (native prompt accepted, or the
    // user toggles it in Settings while the app is foregrounded) so the banner
    // clears immediately instead of waiting for the next background→active cycle.
    let removePermissionObserver: (() => void) | undefined;
    void import("@/lib/onesignal-client").then(({ addOneSignalPermissionObserver }) => {
      removePermissionObserver = addOneSignalPermissionObserver(() => void check());
    });
    void check();
    return () => {
      sub.remove();
      removePermissionObserver?.();
    };
  }, [check]);

  const handleTurnOn = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { requestOneSignalPushPermission } = await import("@/lib/onesignal-client");
      await requestOneSignalPushPermission(true);
    } catch {
      // ignore
    } finally {
      setBusy(false);
      void check();
    }
  }, [busy, check]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    void AsyncStorage.setItem(PUSH_NUDGE_DISMISSED_KEY, String(Date.now())).catch(() => {});
  }, []);

  if (!visible || onNotificationSettings) return null;

  return (
    <View
      style={{
        backgroundColor: "#EFF6FF",
        borderBottomWidth: 1,
        borderBottomColor: "#BFDBFE",
        paddingTop: insets.top,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Ionicons name="notifications-outline" size={20} color="#1D4ED8" style={{ marginRight: 10 }} />
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E3A8A" }} numberOfLines={1}>
            {t("common.pushPermission.bannerTitle")}
          </Text>
          <Text style={{ fontSize: 12, color: "#1E40AF", marginTop: 1 }} numberOfLines={2}>
            {t("common.pushPermission.bannerBody")}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => void handleTurnOn()}
          disabled={busy}
          style={{
            backgroundColor: "#1D4ED8",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            opacity: busy ? 0.6 : 1,
            minWidth: 64,
            alignItems: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel={t("common.pushPermission.turnOn")}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
              {t("common.pushPermission.turnOn")}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ marginLeft: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t("common.pushPermission.dismiss")}
        >
          <Ionicons name="close" size={18} color="#1E3A8A" />
        </TouchableOpacity>
      </View>
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
  /**
   * A rejected registration cannot be fixed by retrying with the same session,
   * so the 3s/10s/30s retry ladder below stops after one. Cleared on user change
   * and on every foreground, which is where the session can actually change.
   */
  const authRejectedRef = useRef(false);
  const [appId, setAppId] = useState<string | null>(null);
  const userId = user?.id ?? null;

  /**
   * The only path to POST /api/me/devices. Every registration trigger (initial
   * subscription, the post-onboarding retry ladder, and the foreground
   * re-register) funnels through here so a single rejection latches them all off
   * instead of each one re-deciding what to do about a 401/403.
   */
  const registerDevice = useCallback(
    async (playerId: string, source: string): Promise<void> => {
      if (!userId) return;
      const normalizedPlayerId = playerId.trim();
      if (!normalizedPlayerId) return;
      if (registeredRef.current && lastRegisteredPlayerIdRef.current === normalizedPlayerId) return;
      if (authRejectedRef.current) return;
      try {
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await api.post<{ registered?: boolean }>("/api/me/devices", {
          player_id: normalizedPlayerId,
          platform,
          app_type: "customer",
        });
        const status = (res.error as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403) {
          // The api client already refreshed the token and retried once before
          // surfacing this, so retrying again with the same session cannot help.
          authRejectedRef.current = true;
          addBreadcrumb("Device register deferred (not authorized)", "push_notifications", {
            code: res.error?.code,
            source,
            status,
          });
          return;
        }
        if (!res.error) {
          registeredRef.current = true;
          lastRegisteredPlayerIdRef.current = normalizedPlayerId;
          void setRegisteredPlayerId(userId, normalizedPlayerId);
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
    },
    [userId],
  );

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
      authRejectedRef.current = false;
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

          // Re-sync badge from server (single source of truth). While the app is
          // active, suppress the OS banner so the in-app banner (driven by the
          // notifications realtime INSERT) owns foreground UX — users never see
          // both an OS banner and the in-app banner for the same event.
          // Background/killed-app pushes are unaffected (AppState won't be "active").
          OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: NotificationWillDisplayEvent) => {
            const data = (event.notification.additionalData ?? {}) as Record<string, unknown>;
            if (isBadgeSyncPushData(data)) {
              event.preventDefault();
              emitNotificationBadgeRefresh();
              return;
            }
            if (AppState.currentState === "active") {
              // In-app banner (realtime-driven) owns foreground display.
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
          await registerDevice(nextId, "subscription_change");
          // The subscription now exists — re-assert external-id binding so
          // alias-targeted pushes reach this exact identity (not just broadcasts).
          if (user) await ensureOneSignalExternalId(user.id);
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
          await registerDevice(subId, "initial_subscription");
        } else {
          SUBSCRIPTION_RETRY_DELAYS_MS.forEach((delay) => {
            const timeoutId = setTimeout(async () => {
            try {
              const id = await getOneSignalSubscriptionId();
                if (id) await registerDevice(id, `retry_${delay}`);
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
  }, [appId, user, gate, registerDevice]);

  // After first-run onboarding completes, register device if the user just granted push in the sheet.
  useEffect(() => {
    if (Platform.OS === "web" || !appId || !user) return;
    if (gate.phase !== "complete" || gate.fromRestore) return;

    let cancelled = false;
    let timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const tryRegister = async () => {
      if (cancelled || registeredRef.current || authRejectedRef.current) return;
      try {
        const id = await getOneSignalSubscriptionId();
        if (!id || cancelled || registeredRef.current) return;
        await registerDevice(id, "post_onboarding_gate");
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
          // A foreground is where the session may have changed, so give a
          // previously-rejected registration one fresh attempt.
          authRejectedRef.current = false;
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
