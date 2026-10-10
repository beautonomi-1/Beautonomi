import { toStoragePath } from "@/lib/explore/media-urls";
import type { ExploreMediaSlideMeta, ExplorePostRowLike } from "@/lib/explore/media-types";

const BUCKET_PREFIX = "explore-posts/";

function normalizeBucketPath(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const stripped = value.split("?")[0]?.trim() ?? "";
  if (!stripped) return null;
  if (stripped.startsWith("http://") || stripped.startsWith("https://")) {
    const path = toStoragePath(stripped);
    if (path.startsWith("http")) return null;
    return path.replace(/^\//, "");
  }
  return stripped.replace(/^\//, "");
}

function addPath(set: Set<string>, value: string | null | undefined) {
  const p = normalizeBucketPath(value);
  if (p && !p.includes("..")) set.add(p);
}

export function collectExplorePostStoragePaths(row: ExplorePostRowLike): string[] {
  const paths = new Set<string>();
  for (const u of row.media_urls ?? []) addPath(paths, u);
  addPath(paths, row.display_path);
  addPath(paths, row.playback_path);
  for (const slide of row.media_meta ?? []) {
    addPath(paths, slide.display_path);
    addPath(paths, slide.playback_path);
  }
  return [...paths];
}

export function collectExploreSoundStoragePath(storagePath: string | null | undefined): string | null {
  return normalizeBucketPath(storagePath);
}

/** Batch remove from explore-posts; ignores missing objects. */
export async function removeExplorePostsStoragePaths(
  storage: { from: (bucket: string) => { remove: (paths: string[]) => Promise<{ error: unknown }> } },
  paths: string[],
): Promise<void> {
  const unique = [...new Set(paths.map((p) => p.replace(/^\//, "")))].filter(Boolean);
  const batchSize = 100;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const { error } = await storage.from("explore-posts").remove(batch);
    if (error) {
      console.warn("[explore storage] remove batch:", error);
    }
  }
}

export { BUCKET_PREFIX };
