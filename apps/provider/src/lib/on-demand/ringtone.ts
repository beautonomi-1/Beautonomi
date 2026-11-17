/**
 * Provider app: ringtone playback via signed URL + expo-audio.
 * On-demand requires module enabled + path; normal booking alerts only require normal_booking path.
 */

import { Platform } from "react-native";
import { APP_URL, withWebApiTenantHeaders } from "@/config/public-env";
import { getActiveConfigEnvironment, type OnDemandModuleConfig } from "@/lib/config-bundle";

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
  const env = getActiveConfigEnvironment();
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

function startPlayback(
  resolveUrl: () => Promise<string | null>,
  ringDurationSeconds: number,
  ringRepeat: boolean,
): RingtoneController {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let player: ReturnType<typeof import("expo-audio").createAudioPlayer> | null = null;
  let stopped = false;

  const stop = () => {
    stopped = true;
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (player) {
      try {
        player.pause();
        player.remove();
      } catch {
        // ignore
      }
      player = null;
    }
  };

  void (async () => {
    if (stopped) return;
    const url = await resolveUrl();
    if (!url || stopped) return;
    try {
      const { createAudioPlayer, setAudioModeAsync } = await import("expo-audio");
      if (stopped) return;
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "duckOthers",
      });
      if (stopped) return;
      player = createAudioPlayer({ uri: url });
      player.loop = ringRepeat;
      player.play();
      if (stopped) {
        stop();
        return;
      }
      timeoutId = setTimeout(() => {
        stop();
      }, Math.max(1000, ringDurationSeconds * 1000));
    } catch {
      stop();
    }
  })();

  return { stop };
}

export function playRingtone(
  config: OnDemandModuleConfig,
  signedUrl?: string,
): Promise<RingtoneController> {
  if (!config.enabled || !config.ringtone_asset_path) {
    return Promise.resolve({ stop: () => {} });
  }

  return Promise.resolve(
    startPlayback(async () => {
      if (signedUrl?.trim()) return signedUrl.trim();
      return fetchSignedRingtoneUrl("on_demand");
    }, config.ring_duration_seconds ?? 20, config.ring_repeat ?? true),
  );
}

/**
 * Standard booking Realtime alert — does not require on_demand.enabled.
 * Uses control-plane `normal_booking_ringtone_asset_path` when set.
 */
export function playNormalBookingRingtone(
  config: OnDemandModuleConfig,
  signedUrl?: string,
): Promise<RingtoneController> {
  if (!config.normal_booking_ringtone_asset_path?.trim()) {
    return Promise.resolve({ stop: () => {} });
  }

  return Promise.resolve(
    startPlayback(
      async () => {
        if (signedUrl?.trim()) return signedUrl.trim();
        return fetchSignedRingtoneUrl("normal_booking");
      },
      config.normal_booking_ring_duration_seconds ?? 20,
      config.normal_booking_ring_repeat ?? true,
    ),
  );
}
