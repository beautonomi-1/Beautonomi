const BUCKET = "explore-posts";
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mpeg|mpg)(\?|$)/i;

export function exploreAdminMediaUrl(path: string, supabaseUrl: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path.replace(/^\//, "")}`;
}

export function exploreAdminPreviewPath(row: Record<string, unknown>): {
  previewPath?: string;
  isVideo: boolean;
} {
  const display = typeof row.display_path === "string" ? row.display_path : undefined;
  const mediaUrls = Array.isArray(row.media_urls) ? (row.media_urls as string[]) : [];
  const first = mediaUrls[0];
  const isVideo = first ? VIDEO_EXT.test(first.split("?")[0] ?? first) : false;
  if (display) return { previewPath: display, isVideo };
  if (first && !isVideo) return { previewPath: first, isVideo: false };
  return { previewPath: undefined, isVideo };
}

export function exploreAdminPlaybackPath(row: Record<string, unknown>): string | undefined {
  const playback = typeof row.playback_path === "string" ? row.playback_path : undefined;
  if (playback) return playback;
  const mediaUrls = Array.isArray(row.media_urls) ? (row.media_urls as string[]) : [];
  const first = mediaUrls[0];
  if (first && VIDEO_EXT.test(first.split("?")[0] ?? first)) return first;
  return undefined;
}
