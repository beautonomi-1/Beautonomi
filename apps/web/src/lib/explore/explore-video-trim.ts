export type ExploreVideoTrimWindow = {
  trim_start_ms: number;
  trim_end_ms: number;
};

export function exploreMaxClipMs(fullDurationMs: number, platformMaxMs: number): number {
  return Math.min(Math.max(0, fullDurationMs), platformMaxMs);
}

/** Default: first N seconds (or full clip if shorter than max). */
export function defaultExploreVideoTrim(
  fullDurationMs: number,
  platformMaxMs: number,
): ExploreVideoTrimWindow {
  const clip = exploreMaxClipMs(fullDurationMs, platformMaxMs);
  return { trim_start_ms: 0, trim_end_ms: clip };
}

/** WhatsApp-style sliding window: fixed clip length, user moves start. */
export function slideExploreVideoTrimStart(
  startMs: number,
  fullDurationMs: number,
  platformMaxMs: number,
): ExploreVideoTrimWindow {
  const clip = exploreMaxClipMs(fullDurationMs, platformMaxMs);
  const maxStart = Math.max(0, fullDurationMs - clip);
  const trim_start_ms = Math.min(Math.max(0, Math.round(startMs)), maxStart);
  return { trim_start_ms, trim_end_ms: trim_start_ms + clip };
}

export function sanitizeExploreVideoTrim(
  fullDurationMs: number | null | undefined,
  platformMaxMs: number,
  raw?: { trim_start_ms?: number | null; trim_end_ms?: number | null } | null,
): ExploreVideoTrimWindow | null {
  if (fullDurationMs == null || !Number.isFinite(fullDurationMs) || fullDurationMs <= 0) {
    return null;
  }
  const full = Math.round(fullDurationMs);
  const maxClip = exploreMaxClipMs(full, platformMaxMs);
  if (raw?.trim_start_ms == null && raw?.trim_end_ms == null) {
    return defaultExploreVideoTrim(full, platformMaxMs);
  }
  let start = Math.max(0, Math.round(raw.trim_start_ms ?? 0));
  let end = Math.round(raw.trim_end_ms ?? start + maxClip);
  if (!Number.isFinite(end) || end <= start) {
    return defaultExploreVideoTrim(full, platformMaxMs);
  }
  let len = end - start;
  if (len > maxClip) {
    end = start + maxClip;
    len = maxClip;
  }
  const maxStart = Math.max(0, full - len);
  if (start > maxStart) start = maxStart;
  end = start + len;
  if (end > full) {
    end = full;
    start = Math.max(0, end - len);
  }
  return { trim_start_ms: start, trim_end_ms: end };
}

export function trimWindowDurationMs(trim: ExploreVideoTrimWindow): number {
  return Math.max(0, trim.trim_end_ms - trim.trim_start_ms);
}
