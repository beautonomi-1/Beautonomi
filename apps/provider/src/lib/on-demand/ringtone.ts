/**
 * Provider app: ringtone playback (behind on_demand flag).
 * When on_demand is enabled, fetches signed URL and uses expo-av to play for ring_duration_seconds.
 */

import { Platform } from "react-native";
import { APP_URL } from "@/config/public-env";
import type { OnDemandModuleConfig } from "@/lib/config-bundle";

export interface RingtoneController {
  stop: () => void;
}

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
  return APP_URL?.trim() || "http://localhost:3000";
}

export async function playRingtone(
  config: OnDemandModuleConfig,
  signedUrl?: string
): Promise<RingtoneController> {
  if (!config.enabled || !config.ringtone_asset_path) {
    return { stop: () => {} };
  }

  let url = signedUrl;
  if (!url) {
    const env = __DEV__ ? "development" : "production";
    const base = getBackendBaseUrl().replace(/\/$/, "");
    try {
      const res = await fetch(
        `${base}/api/public/on-demand/ringtone-url?environment=${encodeURIComponent(env)}`
      );
      if (!res.ok) return { stop: () => {} };
      const data = (await res.json()) as { signed_url?: string };
      url = data.signed_url;
    } catch {
      return { stop: () => {} };
    }
  }
  if (!url) return { stop: () => {} };

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
    await sound.setIsLoopingAsync(config.ring_repeat ?? true);
    await sound.playAsync();
  } catch {
    stop();
    return { stop: () => {} };
  }

  const durationMs = Math.max(1000, (config.ring_duration_seconds ?? 20) * 1000);
  timeoutId = setTimeout(() => {
    stop();
  }, durationMs);

  return { stop };
}
