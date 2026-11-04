type ExploreMediaSlideMeta = {
  kind?: string;
  status?: string | null;
  playback_path?: string | null;
};

export type ProviderExplorePostBadge =
  | "hidden"
  | "video_failed"
  | "video_processing"
  | null;

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;

function slideIsVideo(slide: ExploreMediaSlideMeta | undefined, url: string | undefined): boolean {
  if (slide?.kind === "video") return true;
  if (slide?.kind === "image") return false;
  return url ? VIDEO_EXT.test(url.split("?")[0] ?? url) : false;
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
  for (let i = 0; i < len; i += 1) {
    if (!slideIsVideo(meta[i], urls[i])) continue;
    const slide = meta[i];
    if (slide?.status === "failed") return "video_failed";
    const delivered = Boolean(slide?.playback_path?.trim()) && slide?.status === "delivered";
    if (!delivered) return "video_processing";
  }
  return null;
}
