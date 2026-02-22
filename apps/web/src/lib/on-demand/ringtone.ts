/**
 * Web: ringtone playback helper.
 * Fetches a signed URL from GET /api/public/on-demand/ringtone-url (or uses one provided),
 * then plays via HTMLAudioElement for ring_duration_seconds. Call stop() to stop early.
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

export async function playRingtone(
  config: RingtoneConfig,
  options?: PlayOptions
): Promise<{ stop: () => void }> {
  if (!config.enabled || !config.ringtone_asset_path) {
    return { stop: () => {} };
  }

  let url = options?.signedUrl;
  if (!url && typeof fetch !== "undefined") {
    const env = options?.environment ?? "production";
    const res = await fetch(
      `/api/public/on-demand/ringtone-url?environment=${encodeURIComponent(env)}`
    );
    if (!res.ok) return { stop: () => {} };
    const data = (await res.json()) as { signed_url?: string };
    url = data.signed_url;
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
