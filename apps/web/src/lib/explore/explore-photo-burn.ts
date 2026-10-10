import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import { finalizeExploreImageFromStorage } from "@/lib/explore/finalize-explore-image";
import { removeExplorePostsStoragePaths } from "@/lib/explore/storage-paths";

/**
 * Re-burn display JPEGs from originals when photo slides have text overlays (or on publish refresh).
 * Mutates mediaMeta in place. Only runs for image slides when status is published (caller decides).
 */
export async function burnExplorePhotoOverlaysForPublish(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  mediaUrls: string[],
  mediaMeta: ExploreMediaSlideMeta[],
  opts: { forceAllImageSlides?: boolean },
): Promise<ExploreMediaSlideMeta[]> {
  const next = [...mediaMeta];
  const pathsToRemove: string[] = [];

  for (let i = 0; i < mediaUrls.length; i += 1) {
    const slide = next[i] ?? { kind: "image" as const };
    const kind = slide.kind ?? "image";
    if (kind !== "image") continue;

    const overlays = slide.text_overlays;
    const shouldBurn =
      (overlays?.length ?? 0) > 0 || opts.forceAllImageSlides === true;
    if (!shouldBurn) continue;

    const originalPath = mediaUrls[i]?.replace(/^\//, "") ?? "";
    if (!originalPath) continue;

    const oldDisplay = slide.display_path?.replace(/^\//, "") ?? null;
    try {
      const result = await finalizeExploreImageFromStorage(
        supabaseAdmin,
        providerId,
        originalPath,
        { textOverlays: overlays ?? null },
      );
      next[i] = {
        ...slide,
        kind: "image",
        display_path: result.display_path,
        width: result.width,
        height: result.height,
      };
      if (oldDisplay && oldDisplay !== result.display_path.replace(/^\//, "")) {
        pathsToRemove.push(oldDisplay);
      }
    } catch (err) {
      console.warn("[explore] photo burn failed for slide", i, err);
    }
  }

  if (pathsToRemove.length) {
    await removeExplorePostsStoragePaths(supabaseAdmin.storage, pathsToRemove);
  }

  return next;
}
