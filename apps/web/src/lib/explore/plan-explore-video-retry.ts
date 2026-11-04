import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";

export const EXPLORE_VIDEO_STALE_MS = 30 * 60 * 1000;
export const EXPLORE_VIDEO_MAX_RETRIES = 3;

export function exploreVideoSlideNeedsRetry(
  slide: ExploreMediaSlideMeta | undefined,
  nowMs: number,
): boolean {
  if (!slide || slide.kind !== "video") return false;
  if (slide.playback_path?.trim() && slide.status === "delivered") return false;
  if ((slide.retry_count ?? 0) >= EXPLORE_VIDEO_MAX_RETRIES) return false;
  if (slide.status === "failed") return true;
  if (slide.status === "probing" || slide.status === "encoding") {
    const started = slide.processing_started_at ? Date.parse(slide.processing_started_at) : NaN;
    return Number.isFinite(started) && nowMs - started > EXPLORE_VIDEO_STALE_MS;
  }
  return !slide.playback_path?.trim();
}

/**
 * Resets only the video slides that need another attempt and bumps their retry count.
 * Healthy in-progress, delivered, and capped slides are returned unchanged.
 */
export function planExploreVideoRetry(
  meta: ExploreMediaSlideMeta[],
  nowMs: number,
): { meta: ExploreMediaSlideMeta[]; retried: number } {
  let retried = 0;
  const next = meta.map((slide) => {
    if (!exploreVideoSlideNeedsRetry(slide, nowMs)) return slide;
    retried += 1;
    return {
      ...slide,
      probe_job_id: null,
      encode_job_id: null,
      playback_path: null,
      status: null,
      error_code: null,
      processing_started_at: null,
      retry_count: (slide.retry_count ?? 0) + 1,
    };
  });
  return { meta: next, retried };
}
