import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";

/** Patch only the still-image fields on one slide. Playback and overlays stay. */
export function patchExploreSlideCover(
  meta: ExploreMediaSlideMeta[],
  slideIndex: number,
  cover: { display_path: string; width: number; height: number },
): ExploreMediaSlideMeta[] | null {
  const slide = meta[slideIndex];
  if (!slide) return null;
  const next = [...meta];
  next[slideIndex] = {
    ...slide,
    display_path: cover.display_path,
    width: cover.width,
    height: cover.height,
  };
  return next;
}
