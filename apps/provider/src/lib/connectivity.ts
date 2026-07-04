import { AppState, DeviceEventEmitter, type AppStateStatus } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

/**
 * Lightweight, module-level connectivity tracker.
 *
 * iOS often reports a brief "offline" blip when the app resumes (radio waking,
 * isInternetReachable probe). We debounce going offline so the OfflineBar and
 * Sentry don't flash false positives, but come back online immediately.
 */
const OFFLINE_SHOW_DELAY_MS = 2000;

let offline = false;
let started = false;
let offlineTimer: ReturnType<typeof setTimeout> | null = null;
let netInfoUnsubscribe: (() => void) | null = null;
const listeners = new Set<(next: boolean) => void>();

/** True only when NetInfo says we are clearly disconnected — not "unknown". */
export function isNetInfoClearlyOffline(state: NetInfoState): boolean {
  if (state.isConnected === false) return true;
  if (state.isConnected === true && state.isInternetReachable === false) return true;
  return false;
}

function notifyListeners(next: boolean) {
  listeners.forEach((listener) => listener(next));
}

function setOffline(next: boolean) {
  if (offline === next) return;
  const wasOffline = offline;
  offline = next;
  notifyListeners(next);
  if (wasOffline && !next) {
    DeviceEventEmitter.emit("beautonomi:network:recover");
  }
}

function applyNetInfoState(state: NetInfoState) {
  const clearlyOffline = isNetInfoClearlyOffline(state);
  if (!clearlyOffline) {
    if (offlineTimer) {
      clearTimeout(offlineTimer);
      offlineTimer = null;
    }
    setOffline(false);
    return;
  }
  if (offline || offlineTimer) return;
  offlineTimer = setTimeout(() => {
    offlineTimer = null;
    setOffline(true);
  }, OFFLINE_SHOW_DELAY_MS);
}

export function initConnectivityTracking(): void {
  if (started) return;
  started = true;

  netInfoUnsubscribe = NetInfo.addEventListener(applyNetInfoState);
  void NetInfo.fetch().then(applyNetInfoState);

  AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      void NetInfo.fetch().then(applyNetInfoState);
    }
  });
}

/** Subscribe to debounced offline state (for OfflineBar). */
export function subscribeConnectivity(onChange: (nextOffline: boolean) => void): () => void {
  initConnectivityTracking();
  listeners.add(onChange);
  onChange(offline);
  return () => {
    listeners.delete(onChange);
  };
}

/** True when the device currently has no usable internet connection. */
export function isDeviceOffline(): boolean {
  return offline;
}
