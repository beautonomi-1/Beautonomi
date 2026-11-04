import type { ExploreMediaSlideMeta } from "@/types/api";
import { isExploreVideoPathOrUrl } from "@/lib/explore-media";

export type ExplorePlaybackTrimWindow = {
  trim_start_ms: number;
  trim_end_ms: number;
};

function slideIsVideo(
  slide: ExploreMediaSlideMeta | null | undefined,
  mediaUrl: string | undefined,
): boolean {
  if (slide?.kind === "video") return true;
  if (slide?.kind === "image") return false;
  return mediaUrl ? isExploreVideoPathOrUrl(mediaUrl) : false;
}

function slidePlaybackDelivered(
  slide: ExploreMediaSlideMeta | null | undefined,
  postPlaybackPath: string | null | undefined,
  slideIndex: number,
): boolean {
  const playback = slide?.playback_path?.trim() || (slideIndex === 0 ? postPlaybackPath?.trim() : "");
  return Boolean(playback) && slide?.status === "delivered";
}

/** Client-side trim window while source file plays before Rendobar delivery. */
export function getExploreVideoPlaybackTrimWindow(params: {
  slide: ExploreMediaSlideMeta | null | undefined;
  mediaUrl?: string;
  slideIndex?: number;
  postPlaybackPath?: string | null;
}): ExplorePlaybackTrimWindow | null {
  const slideIndex = params.slideIndex ?? 0;
  const slide = params.slide;
  if (!slideIsVideo(slide, params.mediaUrl)) return null;
  if (slidePlaybackDelivered(slide, params.postPlaybackPath, slideIndex)) return null;

  const start = slide?.trim_start_ms;
  const end = slide?.trim_end_ms;
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end <= start) return null;
  return { trim_start_ms: Math.max(0, Math.round(start)), trim_end_ms: Math.round(end) };
}

export function deliveredExploreVideoShareUrl(params: {
  slide: ExploreMediaSlideMeta | null | undefined;
  mediaUrl?: string;
  slideIndex?: number;
  postPlaybackPath?: string | null;
}): string | null {
  const slideIndex = params.slideIndex ?? 0;
  const slide = params.slide;
  if (!slideIsVideo(slide, params.mediaUrl)) return null;
  if (!slidePlaybackDelivered(slide, params.postPlaybackPath, slideIndex)) return null;
  const playback =
    slide?.playback_path?.trim() || (slideIndex === 0 ? params.postPlaybackPath?.trim() : "");
  if (!playback?.startsWith("https://")) return null;
  return playback;
}
