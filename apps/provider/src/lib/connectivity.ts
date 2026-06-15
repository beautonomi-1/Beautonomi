import NetInfo from "@react-native-community/netinfo";

/**
 * Lightweight, module-level connectivity tracker.
 *
 * A single NetInfo subscription keeps `offline` up to date so synchronous
 * callers (e.g. Sentry's `captureError`/`beforeSend`) can cheaply decide
 * whether a failure is just the device being offline — without each having to
 * open its own NetInfo listener or await `NetInfo.fetch()`.
 *
 * Default is "online" until proven otherwise, so we never wrongly suppress a
 * genuine error before tracking has started.
 */
let offline = false;
let unsubscribe: (() => void) | null = null;

export function initConnectivityTracking(): void {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener((state) => {
    offline = !(state.isConnected && state.isInternetReachable !== false);
  });
}

/** True when the device currently has no usable internet connection. */
export function isDeviceOffline(): boolean {
  return offline;
}
