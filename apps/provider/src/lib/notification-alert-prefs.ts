import { DeviceEventEmitter } from "react-native";
import { api } from "@/lib/api-client";
import { ALERT_PREFS_CHANGED_EVENT } from "@/lib/notification-badge-events";
import { isProviderApiReady, subscribeProviderApiReady } from "@/lib/provider-api-readiness";

export type AlertSoundPrefs = {
  booking_alert_sound: boolean;
  order_alert_sound: boolean;
  message_alert_sound: boolean;
};

const DEFAULT_PREFS: AlertSoundPrefs = {
  booking_alert_sound: true,
  order_alert_sound: true,
  message_alert_sound: true,
};

let cachedPrefs: AlertSoundPrefs = { ...DEFAULT_PREFS };
let loadPromise: Promise<AlertSoundPrefs> | null = null;

export function getAlertSoundPrefs(): AlertSoundPrefs {
  return cachedPrefs;
}

export async function refreshAlertSoundPrefs(): Promise<AlertSoundPrefs> {
  if (loadPromise) return loadPromise;
  // The alert listeners mount for onboarding users too, where this endpoint can
  // only 403. Defaults are correct until the role is upgraded, and the
  // subscription below reloads the real prefs the moment it is.
  if (!isProviderApiReady()) return cachedPrefs;
  loadPromise = (async () => {
    try {
      const res = await api.get<Record<string, unknown>>("/api/provider/notification-preferences");
      if (res.data) {
        const data = res.data as Record<string, unknown>;
        const inner = (data.preferences ?? data.data ?? data) as Record<string, unknown>;
        cachedPrefs = {
          booking_alert_sound: inner.booking_alert_sound !== false,
          order_alert_sound: inner.order_alert_sound !== false,
          message_alert_sound: inner.message_alert_sound !== false,
        };
      }
    } catch {
      cachedPrefs = { ...DEFAULT_PREFS };
    } finally {
      loadPromise = null;
    }
    return cachedPrefs;
  })();
  return loadPromise;
}

export function subscribeAlertSoundPrefs(onChange: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(ALERT_PREFS_CHANGED_EVENT, onChange);
  return () => sub.remove();
}

subscribeProviderApiReady((ready) => {
  if (ready) {
    void refreshAlertSoundPrefs();
    return;
  }
  // Sign-out drops readiness. Clearing here stops the next account from
  // inheriting this provider's muted alerts before their own prefs load.
  cachedPrefs = { ...DEFAULT_PREFS };
});
