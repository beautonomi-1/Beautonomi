/** Vercel serverless request body limit (~4.5 MB). Multipart images above this use signed upload. */
export const EXPLORE_MULTIPART_IMAGE_MAX_BYTES = Math.floor(4.5 * 1024 * 1024);

export const EXPLORE_ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/avif",
] as const;

export function exploreImageExtFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("heic")) return "heic";
  if (m.includes("heif")) return "heif";
  if (m.includes("gif")) return "gif";
  if (m.includes("avif")) return "avif";
  return "jpg";
}

export function isAllowedExploreImageMime(mime: string, fileName?: string): boolean {
  const declared = (mime || "").toLowerCase();
  const looksLikeImageByExt =
    fileName != null && /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(fileName);
  return (
    (EXPLORE_ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(declared) ||
    ((declared === "" || declared === "application/octet-stream") && looksLikeImageByExt)
  );
}
