/**
 * Push Notifications Provider – OneSignal
 * Fetches app_id from superadmin (GET /api/public/third-party-config?service=onesignal&app=customer).
 * Fallback: EXPO_PUBLIC_ONESIGNAL_APP_ID from env.
 * Registers device with POST /api/me/devices (onesignal_player_id = OneSignal subscription ID).
 * Handles notification tap deep links via expo-router.
 * Requires development build (not Expo Go).
 */
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { NotificationClickEvent, NotificationWillDisplayEvent } from "react-native-onesignal";
import { useAuth } from "@/providers/AuthProvider";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
import { api } from "@/lib/api-client";
import {
  clearPendingPushNotification,
  ensureOneSignalInitialized,
  enqueueOrRoutePushNotification,
  flushPendingPushNotification,
  getOneSignalSubscriptionId,
  logoutOneSignal,
  resolveOneSignalAppId,
  setPushNavigationReady,
} from "@/lib/onesignal-client";
import { trackNotificationOpened } from "@/lib/analytics";
import { addBreadcrumb, captureError } from "@/lib/sentry";
import { navigateFromNotification, type Notification } from "@/lib/notifications";

const SUBSCRIPTION_RETRY_DELAYS_MS = [3000, 10000, 30000];

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
  } catch {
    // Silently fail on routing errors
  }
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
            enqueueOrRoutePushNotification(merged, (payload) =>
              handleNotificationRoute(payload, {
                launchUrl,
                title: raw.title,
                body: raw.body,
              }),
            );
          });

          // Show immediately in the notification shade while the app is open (not queued by us).
          OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: NotificationWillDisplayEvent) => {
            event.getNotification().display();
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
        const { OneSignal } = await import("react-native-onesignal");
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
      void (async () => {
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
  return <>{children}</>;
}
