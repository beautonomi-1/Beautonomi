import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";

export function resetExploreVideoSlidesForReprocess(
  mediaMeta: ExploreMediaSlideMeta[],
  options?: { forceAllVideo?: boolean },
): ExploreMediaSlideMeta[] {
  const force = options?.forceAllVideo === true;
  return mediaMeta.map((slide) => {
    if (slide.kind !== "video") return slide;
    const delivered = Boolean(slide.playback_path?.trim()) && slide.status === "delivered";
    if (delivered && !force) return slide;
    return {
      ...slide,
      probe_job_id: null,
      encode_job_id: null,
      playback_path: null,
      status: null,
      error_code: null,
      retry_count: 0,
      processing_started_at: null,
    };
  });
}
