/**
 * Shared OneSignal bootstrap for the customer app.
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

  if (initInflight && initializedFor === normalizedAppId) {
    await initInflight;
    if (userId && loggedInUserId !== userId) {
      const { OneSignal } = await import("react-native-onesignal");
      OneSignal.login(userId);
      loggedInUserId = userId;
    }
    return;
  }

  initInflight = (async () => {
    const { OneSignal, LogLevel } = await import("react-native-onesignal");
    OneSignal.Debug.setLogLevel(LogLevel.None);
    if (initializedFor !== normalizedAppId) {
      OneSignal.initialize(normalizedAppId);
      initializedFor = normalizedAppId;
      loggedInUserId = null;
    }
    if (userId && loggedInUserId !== userId) {
      OneSignal.login(userId);
      loggedInUserId = userId;
    }
  })();

  try {
    await initInflight;
  } finally {
    initInflight = null;
  }
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
    const { OneSignal } = await import("react-native-onesignal");
    const granted = await OneSignal.Notifications.getPermissionAsync();
    return granted === true;
  } catch {
    return false;
  }
}

export async function requestOneSignalPushPermission(fallbackToSettings = true): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
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
    const { OneSignal } = await import("react-native-onesignal");
    const id = await OneSignal.User.pushSubscription.getIdAsync();
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export async function logoutOneSignal(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const playerId = await getOneSignalSubscriptionId();
    const { OneSignal } = await import("react-native-onesignal");
    OneSignal.logout();
    initializedFor = null;
    loggedInUserId = null;
    return playerId;
  } catch {
    return null;
  }
}
