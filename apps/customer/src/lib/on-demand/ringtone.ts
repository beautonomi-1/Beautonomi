/**
 * Customer app: ringtone playback helper (behind on_demand flag).
 * When on_demand is enabled, plays ringtone via expo-av for ring_duration_seconds.
 * Uses signedUrl when provided, otherwise ringtone_asset_path from config (if a URL).
 */

import { Audio } from "expo-av";
import type { OnDemandModuleConfig } from "@/lib/config-bundle";
import { APP_URL, withWebApiTenantHeaders } from "@/config/public-env";

export interface RingtoneController {
  stop: () => void;
}

export async function playRingtone(
  config: OnDemandModuleConfig,
  signedUrl?: string
): Promise<RingtoneController> {
  if (!config.enabled) {
    return { stop: () => {} };
  }

  let source = signedUrl ?? (config.ringtone_asset_path?.startsWith("http") ? config.ringtone_asset_path : null);
  if (!source && config.ringtone_asset_path) {
    try {
      const env = __DEV__ ? "development" : "production";
      const base = (APP_URL?.trim() || (__DEV__ ? "http://localhost:3000" : "")).replace(/\/$/, "");
      if (base) {
        const res = await fetch(
          `${base}/api/public/on-demand/ringtone-url?environment=${encodeURIComponent(env)}`,
          withWebApiTenantHeaders(),
        );
        if (res.ok) {
          const data = (await res.json()) as { signed_url?: string };
          source = data.signed_url ?? null;
        }
      }
    } catch {
      // Ringing is best effort; the push/foreground UI still shows.
    }
  }
  if (!source) {
    return { stop: () => {} };
  }

  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: source },
      { shouldPlay: true }
    );

    const durationSec = config.ring_duration_seconds ?? 20;
    if (config.ring_repeat && durationSec > 0) {
      await sound.setIsLoopingAsync(true);
      const stopTimeout = setTimeout(async () => {
        try {
          await sound.stopAsync();
          await sound.unloadAsync();
        } catch {
          // ignore
        }
      }, durationSec * 1000);
      return {
        stop: () => {
          clearTimeout(stopTimeout);
          sound.unloadAsync().catch(() => {});
        },
      };
    }

    return {
      stop: () => {
        sound.unloadAsync().catch(() => {});
      },
    };
  } catch {
    return { stop: () => {} };
  }
}
