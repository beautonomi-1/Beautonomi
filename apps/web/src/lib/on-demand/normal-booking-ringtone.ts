/**
 * Web: optional MP3 (or other browser-supported audio) for standard booking inserts.
 * Uses GET /api/public/on-demand/ringtone-url?scope=normal_booking (same app-assets bucket).
 */

import type { Environment } from "@/lib/config/types";

export interface NormalBookingRingtoneConfig {
  ringtone_asset_path: string | null;
  ring_duration_seconds: number;
  ring_repeat: boolean;
}

export async function playNormalBookingAlertRingtone(
  config: NormalBookingRingtoneConfig,
  environment: Environment = "production",
): Promise<{ stop: () => void }> {
  if (!config.ringtone_asset_path?.trim()) {
    return { stop: () => {} };
  }

  let url: string | undefined;
  try {
    const res = await fetch(
      `/api/public/on-demand/ringtone-url?environment=${encodeURIComponent(environment)}&scope=normal_booking`,
    );
    if (!res.ok) return { stop: () => {} };
    const data = (await res.json()) as { signed_url?: string };
    url = data.signed_url;
  } catch {
    return { stop: () => {} };
  }
  if (!url) return { stop: () => {} };

  const audio = new Audio(url);
  audio.loop = config.ring_repeat;
  const durationMs = Math.max(1000, config.ring_duration_seconds * 1000);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (timeoutId != null) clearTimeout(timeoutId);
    timeoutId = null;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
  };

  try {
    await audio.play();
  } catch {
    return { stop };
  }

  timeoutId = setTimeout(() => {
    stop();
  }, durationMs);

  return { stop };
}
