/**
 * Customer-facing provider gallery frames: uniform landscape crop regardless of
 * source image orientation (portrait uploads are center-cropped like major marketplaces).
 */
export const PROVIDER_GALLERY_ASPECT_RATIO = 16 / 9;

/** CSS object-position for web (`object-cover` companion). */
export const PROVIDER_GALLERY_OBJECT_POSITION = "center 40%";

/** Expo Image `contentPosition` for native (`contentFit="cover"` companion). */
export const PROVIDER_GALLERY_CONTENT_POSITION = {
  top: "40%",
  left: "50%",
} as const;

/** Pixel height for a gallery frame at a given width (16:9). */
export function providerGalleryFrameHeight(
  width: number,
  aspectRatio: number = PROVIDER_GALLERY_ASPECT_RATIO
): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.round(width / aspectRatio);
}
