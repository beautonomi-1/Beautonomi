/**
 * Provider app: ringtone playback via signed URL + expo-av.
 * On-demand requires module enabled + path; normal booking alerts only require normal_booking path.
 */

import { Platform } from "react-native";
import { APP_URL, withWebApiTenantHeaders } from "@/config/public-env";
import type { OnDemandModuleConfig } from "@/lib/config-bundle";

export interface RingtoneController {
  stop: () => void;
}

export type RingtoneUrlScope = "on_demand" | "normal_booking";

function getBackendBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const o = window.location.origin;
    if (
      o === "http://localhost:8081" ||
      o === "http://localhost:8082" ||
      !APP_URL?.trim()
    ) {
      return "http://localhost:3000";
    }
  }
  const url = APP_URL?.trim();
  if (!url && __DEV__) return "http://localhost:3000";
  return url || "";
}

async function fetchSignedRingtoneUrl(scope: RingtoneUrlScope): Promise<string | null> {
  const env = __DEV__ ? "development" : "production";
  const base = getBackendBaseUrl().replace(/\/$/, "");
  try {
    const res = await fetch(
      `${base}/api/public/on-demand/ringtone-url?environment=${encodeURIComponent(env)}&scope=${encodeURIComponent(scope)}`,
      withWebApiTenantHeaders(),
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { signed_url?: string };
    return data.signed_url?.trim() || null;
  } catch {
    return null;
  }
}

async function playUrlWithExpoAv(
  url: string,
  ringDurationSeconds: number,
  ringRepeat: boolean,
): Promise<RingtoneController> {
  let sound: import("expo-av").Audio.Sound | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (sound) {
      sound.stopAsync().catch(() => {});
      sound.unloadAsync().catch(() => {});
      sound = null;
    }
  };

  try {
    const { Audio } = await import("expo-av");
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    sound = new Audio.Sound();
    await sound.loadAsync({ uri: url });
    await sound.setIsLoopingAsync(ringRepeat);
    await sound.playAsync();
  } catch {
    stop();
    return { stop: () => {} };
  }

  const durationMs = Math.max(1000, ringDurationSeconds * 1000);
  timeoutId = setTimeout(() => {
    stop();
  }, durationMs);

  return { stop };
}

export async function playRingtone(
  config: OnDemandModuleConfig,
  signedUrl?: string,
): Promise<RingtoneController> {
  if (!config.enabled || !config.ringtone_asset_path) {
    return { stop: () => {} };
  }

  let url = signedUrl;
  if (!url) {
    url = (await fetchSignedRingtoneUrl("on_demand")) ?? undefined;
  }
  if (!url) return { stop: () => {} };

  return playUrlWithExpoAv(url, config.ring_duration_seconds ?? 20, config.ring_repeat ?? true);
}

/**
 * Standard booking Realtime alert — does not require on_demand.enabled.
 * Uses control-plane `normal_booking_ringtone_asset_path` when set.
 */
export async function playNormalBookingRingtone(
  config: OnDemandModuleConfig,
  signedUrl?: string,
): Promise<RingtoneController> {
  if (!config.normal_booking_ringtone_asset_path?.trim()) {
    return { stop: () => {} };
  }

  let url = signedUrl;
  if (!url) {
    url = (await fetchSignedRingtoneUrl("normal_booking")) ?? undefined;
  }
  if (!url) return { stop: () => {} };

  return playUrlWithExpoAv(
    url,
    config.normal_booking_ring_duration_seconds ?? 20,
    config.normal_booking_ring_repeat ?? true,
  );
}
