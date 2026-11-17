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
/** Bumped when a save or sign-out is newer than an in-flight preference read. */
let prefsEpoch = 0;

export function getAlertSoundPrefs(): AlertSoundPrefs {
  return cachedPrefs;
}

export async function refreshAlertSoundPrefs(): Promise<AlertSoundPrefs> {
  // The alert listeners mount for onboarding users too, where this endpoint can
  // only 403. Defaults are correct until the role is upgraded, and the
  // subscription below reloads the real prefs the moment it is.
  if (!isProviderApiReady()) return cachedPrefs;
  const epoch = ++prefsEpoch;
  try {
    const res = await api.get<Record<string, unknown>>("/api/provider/notification-preferences");
    if (epoch !== prefsEpoch || !isProviderApiReady()) return cachedPrefs;
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
    // Keep the last known setting. A failed reload must not turn a muted alert back on.
  }
  return cachedPrefs;
}

export function subscribeAlertSoundPrefs(onChange: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(
    ALERT_PREFS_CHANGED_EVENT,
    (incoming?: Partial<AlertSoundPrefs>) => {
      if (incoming && typeof incoming === "object") {
        prefsEpoch += 1;
        cachedPrefs = {
          booking_alert_sound:
            typeof incoming.booking_alert_sound === "boolean"
              ? incoming.booking_alert_sound
              : cachedPrefs.booking_alert_sound,
          order_alert_sound:
            typeof incoming.order_alert_sound === "boolean"
              ? incoming.order_alert_sound
              : cachedPrefs.order_alert_sound,
          message_alert_sound:
            typeof incoming.message_alert_sound === "boolean"
              ? incoming.message_alert_sound
              : cachedPrefs.message_alert_sound,
        };
      }
      onChange();
    },
  );
  return () => {
    try {
      (sub as unknown as { remove?: () => void } | undefined)?.remove?.();
    } catch {
      // ignore
    }
  };
}

subscribeProviderApiReady((ready) => {
  if (ready) {
    void refreshAlertSoundPrefs();
    return;
  }
  // Sign-out drops readiness. Clearing here stops the next account from
  // inheriting this provider's muted alerts before their own prefs load.
  prefsEpoch += 1;
  cachedPrefs = { ...DEFAULT_PREFS };
});
