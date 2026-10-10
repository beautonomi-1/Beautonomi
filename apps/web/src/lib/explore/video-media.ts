import { toPublicMediaUrl } from "@/lib/explore/media-urls";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mpeg|mpg)(\?|$)/i;

export function isExploreVideoPathOrUrl(value: string): boolean {
  if (!value?.trim()) return false;
  const path = value.split("?")[0] ?? value;
  return VIDEO_EXT.test(path);
}

export function firstSlideIsVideo(
  mediaUrls: string[] | null | undefined,
  mediaMeta?: ExploreMediaSlideMeta[] | null,
): boolean {
  const meta0 = mediaMeta?.[0];
  if (meta0?.kind === "video") return true;
  if (meta0?.kind === "image") return false;
  const first = mediaUrls?.[0];
  return first ? isExploreVideoPathOrUrl(first) : false;
}

export function resolveExploreVideoSrc(params: {
  mediaUrls: string[];
  playbackPath?: string | null;
  slideIndex?: number;
  mediaMeta?: ExploreMediaSlideMeta[] | null;
  supabaseUrl?: string;
}): string | null {
  const { mediaUrls, playbackPath, slideIndex = 0, mediaMeta, supabaseUrl } = params;
  const slide = mediaMeta?.[slideIndex];
  const playback =
    slide?.playback_path ??
    (slideIndex === 0 ? playbackPath : null);
  if (playback?.trim()) {
    return toPublicMediaUrl(playback, supabaseUrl);
  }
  const original = mediaUrls[slideIndex];
  if (!original) return null;
  return toPublicMediaUrl(original, supabaseUrl);
}
