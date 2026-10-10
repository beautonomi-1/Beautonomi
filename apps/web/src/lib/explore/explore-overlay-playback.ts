import type { ExploreMediaSlideMeta, ExploreTextOverlay } from "@/lib/explore/media-types";

export function shouldDrawVideoTextOverlays(slide: ExploreMediaSlideMeta | null | undefined): boolean {
  if (!slide?.text_overlays?.length) return false;
  if (slide.kind !== "video") return false;
  if (slide.playback_path && slide.status === "delivered") return false;
  return true;
}

export function filterOverlaysForPlaybackTime(
  overlays: ExploreTextOverlay[] | null | undefined,
  timeMs: number,
): ExploreTextOverlay[] {
  if (!overlays?.length) return [];
  return overlays.filter((o) => {
    const start = o.start_ms ?? 0;
    const end = o.end_ms ?? Number.MAX_SAFE_INTEGER;
    return timeMs >= start && timeMs < end;
  });
}
