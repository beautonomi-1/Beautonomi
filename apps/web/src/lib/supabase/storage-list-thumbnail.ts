/**
 * Optional Supabase Storage render transform for list/card thumbnails.
 * Returns the original URL when transforms are unavailable.
 */
export function withStorageListThumbnail(url: string | null | undefined, width = 400): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (!trimmed.includes("/storage/v1/object/public/")) return trimmed;
  if (trimmed.includes("width=") || trimmed.includes("/render/image/")) return trimmed;
  const separator = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${separator}width=${width}&quality=80`;
}
