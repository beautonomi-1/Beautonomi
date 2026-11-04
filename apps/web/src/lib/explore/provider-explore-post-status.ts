import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import { isExploreVideoPathOrUrl } from "@/lib/explore/video-media";

export type ProviderExplorePostBadge =
  | "hidden"
  | "video_failed"
  | "video_processing"
  | null;

function slideIsVideo(slide: ExploreMediaSlideMeta | undefined, url: string | undefined): boolean {
  if (slide?.kind === "video") return true;
  if (slide?.kind === "image") return false;
  return url ? isExploreVideoPathOrUrl(url) : false;
}

export function providerExplorePostBadge(params: {
  is_hidden?: boolean | null;
  media_urls?: string[] | null;
  media_meta?: ExploreMediaSlideMeta[] | null;
}): ProviderExplorePostBadge {
  if (params.is_hidden) return "hidden";
  const meta = params.media_meta ?? [];
  const urls = params.media_urls ?? [];
  const len = Math.max(meta.length, urls.length);
  let sawVideo = false;
  for (let i = 0; i < len; i += 1) {
    if (!slideIsVideo(meta[i], urls[i])) continue;
    sawVideo = true;
    const slide = meta[i];
    if (slide?.status === "failed") return "video_failed";
    const delivered = Boolean(slide?.playback_path?.trim()) && slide?.status === "delivered";
    if (!delivered) return "video_processing";
  }
  if (sawVideo) return null;
  return null;
}
