/**
 * Web: optional MP3 (or other browser-supported audio) for standard booking inserts.
 * Uses GET /api/public/on-demand/ringtone-url?scope=normal_booking (same app-assets bucket).
 * stop() works as soon as this returns, including while the file is still loading.
 */

import type { Environment } from "@/lib/config/types";

export interface NormalBookingRingtoneConfig {
  ringtone_asset_path: string | null;
  ring_duration_seconds: number;
  ring_repeat: boolean;
}

export interface NormalBookingRingtoneController {
  stop: () => void;
  /** Resolves true once the browser has started playback. */
  started: Promise<boolean>;
}

export function playNormalBookingAlertRingtone(
  config: NormalBookingRingtoneConfig,
  environment: Environment = "production",
): Promise<NormalBookingRingtoneController> {
  let audio: HTMLAudioElement | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let startedSettled = false;
  let resolveStarted: (ok: boolean) => void = () => {};
  const started = new Promise<boolean>((resolve) => {
    resolveStarted = resolve;
  });

  const finishStarted = (ok: boolean) => {
    if (startedSettled) return;
    startedSettled = true;
    resolveStarted(ok);
  };

  const stop = () => {
    stopped = true;
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.src = "";
      } catch {
        // ignore
      }
      audio = null;
    }
    finishStarted(false);
  };

  void (async () => {
    if (!config.ringtone_asset_path?.trim() || stopped) {
      finishStarted(false);
      return;
    }

    let url: string | undefined;
    try {
      const res = await fetch(
        `/api/public/on-demand/ringtone-url?environment=${encodeURIComponent(environment)}&scope=normal_booking`,
      );
      if (!res.ok || stopped) {
        finishStarted(false);
        return;
      }
      const data = (await res.json()) as { signed_url?: string };
      url = data.signed_url;
    } catch {
      finishStarted(false);
      return;
    }
    if (!url || stopped) {
      finishStarted(false);
      return;
    }

    const el = new Audio(url);
    audio = el;
    el.loop = config.ring_repeat;
    if (stopped) {
      stop();
      return;
    }

    try {
      await el.play();
    } catch {
      stop();
      return;
    }
    if (stopped) {
      stop();
      return;
    }

    finishStarted(true);
    const durationMs = Math.max(1000, config.ring_duration_seconds * 1000);
    timeoutId = setTimeout(() => {
      stop();
    }, durationMs);
  })();

  return Promise.resolve({ stop, started });
}
