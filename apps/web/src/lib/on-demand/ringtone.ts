/**
 * Web: ringtone playback helper.
 * Fetches a signed URL from GET /api/public/on-demand/ringtone-url (or uses one provided),
 * then plays via HTMLAudioElement for ring_duration_seconds.
 * stop() works as soon as this returns, including while the file is still loading.
 */

export interface RingtoneConfig {
  enabled: boolean;
  ringtone_asset_path: string | null;
  ring_duration_seconds: number;
  ring_repeat: boolean;
}

export interface PlayOptions {
  /** If provided, skip fetching and use this URL. Otherwise fetched from API. */
  signedUrl?: string;
  /** Environment for the ringtone-url API when not using signedUrl. Default "production". */
  environment?: "production" | "staging" | "development";
}

export function playRingtone(
  config: RingtoneConfig,
  options?: PlayOptions,
): Promise<{ stop: () => void }> {
  let audio: HTMLAudioElement | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

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
  };

  void (async () => {
    if (!config.enabled || !config.ringtone_asset_path || stopped) return;

    let url = options?.signedUrl;
    if (!url && typeof fetch !== "undefined") {
      const env = options?.environment ?? "production";
      try {
        const res = await fetch(
          `/api/public/on-demand/ringtone-url?environment=${encodeURIComponent(env)}`,
        );
        if (!res.ok || stopped) return;
        const data = (await res.json()) as { signed_url?: string };
        url = data.signed_url;
      } catch {
        return;
      }
    }
    if (!url || stopped) return;

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

    const durationMs = Math.max(1000, config.ring_duration_seconds * 1000);
    timeoutId = setTimeout(() => {
      stop();
    }, durationMs);
  })();

  return Promise.resolve({ stop });
}
