/**
 * Shared OneSignal bootstrap for the provider app.
 * Ensures initialize/login happen before permission prompts and queues cold-start
 * notification routes until auth + navigation are ready.
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ONE_SIGNAL_APP_ID } from "@/config/public-env";
import { getOneSignalAppId } from "@/lib/third-party-config";

const REGISTERED_PLAYER_KEY = "beautonomi.registeredPlayerId.v1";

/** Last OneSignal subscription id we successfully registered with the backend
 * for this user. Persisted so a cold start / foreground can skip redundant
 * device registrations and detect when the OS rotated the subscription id. */
export async function getRegisteredPlayerId(userId: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(REGISTERED_PLAYER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; playerId?: string };
    if (parsed?.userId === userId && typeof parsed.playerId === "string") {
      return parsed.playerId.trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setRegisteredPlayerId(userId: string, playerId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      REGISTERED_PLAYER_KEY,
      JSON.stringify({ userId, playerId: playerId.trim() }),
    );
  } catch {
    // ignore storage failures; in-memory guard still applies
  }
}

export async function clearRegisteredPlayerId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REGISTERED_PLAYER_KEY);
  } catch {
    // ignore
  }
}

let initialized = false;
let initializedFor: string | null = null;
let initInflight: Promise<void> | null = null;
let loggedInUserId: string | null = null;
let pendingPushPayload: Record<string, unknown> | null = null;
let pushNavigationReady = false;

export async function resolveOneSignalAppId(): Promise<string | null> {
  try {
    const fromApi = await getOneSignalAppId();
    const id = fromApi || ONE_SIGNAL_APP_ID || "";
    return id.trim() ? id.trim() : null;
  } catch {
    const fallback = ONE_SIGNAL_APP_ID?.trim();
    return fallback || null;
  }
}

export async function ensureOneSignalInitialized(appId: string, userId?: string | null): Promise<void> {
  if (Platform.OS === "web") return;
  const normalizedAppId = appId.trim();
  if (!normalizedAppId) return;

  // Coalesce concurrent callers onto a single in-flight init so we never run
  // `OneSignal.initialize` twice or let a native call race ahead of it (which
  // surfaces as the native "Must call 'initWithContext' before use" error).
  if (initInflight) {
    await initInflight;
  } else {
    initInflight = (async () => {
      const { OneSignal, LogLevel } = await import("react-native-onesignal");
      OneSignal.Debug.setLogLevel(LogLevel.None);
      if (!initialized || initializedFor !== normalizedAppId) {
        OneSignal.initialize(normalizedAppId);
        initialized = true;
        initializedFor = normalizedAppId;
        loggedInUserId = null;
      }
    })();
    try {
      await initInflight;
    } finally {
      initInflight = null;
    }
  }

  if (initialized && userId && loggedInUserId !== userId) {
    try {
      const { OneSignal } = await import("react-native-onesignal");
      OneSignal.login(userId);
      loggedInUserId = userId;
    } catch {
      // ensureOneSignalExternalId / next foreground re-attempts the binding
    }
  }
}

/**
 * Guarantee the OneSignal native SDK is initialized before any of its APIs are
 * touched. Resolves the app id on demand, so helpers invoked before the push
 * registration effect runs (e.g. the permission nudge on cold start / resume)
 * can never trip the native "Must call 'initWithContext' before use" error.
 * Returns `true` only when the SDK is usable (native build + app id resolved).
 */
async function ensureOneSignalReady(userId?: string | null): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!initialized) {
    const appId = await resolveOneSignalAppId();
    if (!appId) return false;
    await ensureOneSignalInitialized(appId, userId);
  } else if (userId && loggedInUserId !== userId && initializedFor) {
    await ensureOneSignalInitialized(initializedFor, userId);
  }
  return initialized;
}

export function setPushNavigationReady(ready: boolean) {
  pushNavigationReady = ready;
}

export function enqueueOrRoutePushNotification(
  payload: Record<string, unknown>,
  route: (payload: Record<string, unknown>) => void,
) {
  if (!pushNavigationReady) {
    pendingPushPayload = payload;
    return;
  }
  route(payload);
}

export function flushPendingPushNotification(route: (payload: Record<string, unknown>) => void) {
  if (!pushNavigationReady || !pendingPushPayload) return;
  const payload = pendingPushPayload;
  pendingPushPayload = null;
  setTimeout(() => route(payload), 350);
}

export function clearPendingPushNotification() {
  pendingPushPayload = null;
}

export async function getOneSignalPermissionAsync(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    if (!(await ensureOneSignalReady())) return false;
    const { OneSignal } = await import("react-native-onesignal");
    const granted = await OneSignal.Notifications.getPermissionAsync();
    return granted === true;
  } catch {
    return false;
  }
}

/**
 * Subscribe to OS push-permission changes. The listener fires with `true`/`false`
 * whenever the user grants or revokes notification permission (native prompt or
 * the system Settings screen). Returns an unsubscribe function. No-op on web or
 * when the OneSignal native module is unavailable (e.g. Expo Go).
 *
 * Event name + boolean payload follow react-native-onesignal v5
 * (`permissionChange` → `(granted: boolean) => void`).
 */
export function addOneSignalPermissionObserver(
  handler: (granted: boolean) => void,
): () => void {
  if (Platform.OS === "web") return () => {};
  let active = true;
  let cleanup: (() => void) | undefined;
  void (async () => {
    try {
      if (!(await ensureOneSignalReady())) return;
      if (!active) return;
      const { OneSignal } = await import("react-native-onesignal");
      OneSignal.Notifications.addEventListener("permissionChange", handler);
      cleanup = () => {
        try {
          OneSignal.Notifications.removeEventListener("permissionChange", handler);
        } catch {
          // ignore teardown errors
        }
      };
    } catch {
      // OneSignal unavailable — callers fall back to AppState re-checks.
    }
  })();
  return () => {
    active = false;
    cleanup?.();
  };
}

/**
 * Re-assert the OneSignal external-id ↔ user binding.
 *
 * `OneSignal.login(userId)` runs during init, but when it fires before the push
 * subscription is created the external id can land on a different OneSignal
 * identity than the one that owns the live subscription. Alias-targeted server
 * sends (`include_aliases.external_id`) then miss the device even though
 * broadcasts (segment-targeted) still arrive — the classic "broadcast works but
 * targeted push doesn't" symptom. Verify the binding once the subscription
 * exists and re-login only when it doesn't match. Idempotent and best-effort.
 */
export async function ensureOneSignalExternalId(userId: string): Promise<void> {
  if (Platform.OS === "web" || !userId) return;
  try {
    if (!(await ensureOneSignalReady(userId))) return;
    const { OneSignal } = await import("react-native-onesignal");
    const current = await OneSignal.User.getExternalId();
    if (current === userId) return;
    OneSignal.login(userId);
    loggedInUserId = userId;
  } catch {
    // ignore — subscription-change / next foreground will re-attempt
  }
}

export async function requestOneSignalPushPermission(fallbackToSettings = true): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    if (!(await ensureOneSignalReady())) return false;
    const { OneSignal } = await import("react-native-onesignal");
    const accepted = await OneSignal.Notifications.requestPermission(fallbackToSettings);
    return accepted === true;
  } catch {
    return false;
  }
}

export async function getOneSignalSubscriptionId(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    if (!(await ensureOneSignalReady())) return null;
    const { OneSignal } = await import("react-native-onesignal");
    const id = await OneSignal.User.pushSubscription.getIdAsync();
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export async function logoutOneSignal(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  // Nothing to tear down if the SDK was never initialized — avoids a native
  // call before init.
  if (!initialized) return null;
  try {
    const playerId = await getOneSignalSubscriptionId();
    const { OneSignal } = await import("react-native-onesignal");
    OneSignal.logout();
    initialized = false;
    initializedFor = null;
    loggedInUserId = null;
    return playerId;
  } catch {
    return null;
  }
}
