import { SUPABASE_URL } from "@/config/public-env";
import type { ExploreMediaSlideMeta, ExplorePost } from "@/types/api";

const BUCKET = "explore-posts";
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mpeg|mpg)(\?|$)/i;

export function toPublicMediaUrl(value: string, supabaseUrl: string = SUPABASE_URL): string {
  if (!value?.trim()) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (!supabaseUrl) return value;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${value.replace(/^\//, "")}`;
}

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
}): string | null {
  const { mediaUrls, playbackPath, slideIndex = 0, mediaMeta } = params;
  const slide = mediaMeta?.[slideIndex];
  const playback = slide?.playback_path ?? (slideIndex === 0 ? playbackPath : null);
  if (playback?.trim()) {
    return toPublicMediaUrl(playback);
  }
  const original = mediaUrls[slideIndex];
  if (!original) return null;
  return toPublicMediaUrl(original);
}

export function explorePostGridImageUrl(post: ExplorePost): string {
  if (post.display_url?.trim()) return post.display_url;
  const meta0 = post.media_meta?.[0];
  if (meta0?.display_path?.trim()) return toPublicMediaUrl(meta0.display_path);
  return post.media_urls?.[0] ?? "";
}

export function clampExploreAspectRatio(width?: number | null, height?: number | null): number {
  if (width != null && height != null && height > 0) {
    const ratio = width / height;
    return Math.min(1.5, Math.max(0.6, ratio));
  }
  return 1;
}

export function getExplorePostAspect(post: ExplorePost): number {
  if (post.media_width != null && post.media_height != null && post.media_height > 0) {
    return clampExploreAspectRatio(post.media_width, post.media_height);
  }
  let h = 0;
  for (let i = 0; i < post.id.length; i++) {
    h = ((h << 5) - h + post.id.charCodeAt(i)) | 0;
  }
  const aspects = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3];
  return aspects[Math.abs(h) % aspects.length];
}

export type ExploreSlideView = {
  index: number;
  kind: "image" | "video";
  displayUrl: string;
  playbackUrl?: string | null;
};

export function buildExploreSlides(post: ExplorePost): ExploreSlideView[] {
  const urls = post.media_urls?.length ? post.media_urls : [];
  if (!urls.length) return [];
  return urls.map((url, index) => {
    const meta = post.media_meta?.[index];
    const kind = meta?.kind ?? (isExploreVideoPathOrUrl(url) ? "video" : "image");
    const displayFromMeta = meta?.display_path?.trim();
    const displayUrl =
      kind === "video"
        ? post.display_url && index === 0
          ? post.display_url
          : displayFromMeta
            ? toPublicMediaUrl(displayFromMeta)
            : post.display_url ?? url
        : displayFromMeta
          ? toPublicMediaUrl(displayFromMeta)
          : url;
    return {
      index,
      kind: kind === "video" ? "video" : "image",
      displayUrl,
      playbackUrl:
        kind === "video"
          ? resolveExploreVideoSrc({
              mediaUrls: urls,
              playbackPath: post.playback_path,
              slideIndex: index,
              mediaMeta: post.media_meta,
            })
          : null,
    };
  });
}
