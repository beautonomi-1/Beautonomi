/** Fields needed to pick a social preview image (raster only for most crawlers). */
export type PartnerProfileOgMedia = {
  thumbnail_url?: string | null;
  avatar_url?: string | null;
  gallery?: string[] | null;
};

/** Turn stored media paths into absolute URLs for crawlers (WhatsApp, iMessage, etc.). */
export function toAbsolutePublicUrl(origin: string, url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const t = url.trim();
  if (!t) return null;
  const base = origin.replace(/\/$/, "");
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("/")) return `${base}${t}`;
  return t;
}

/**
 * WhatsApp / Facebook / Telegram generally ignore SVG for og:image.
 * Prefer obvious raster extensions; allow HTTPS URLs without extension (e.g. some CDNs).
 */
export function isSocialPreviewRasterUrl(url: string): boolean {
  const noQuery = url.split("?")[0].toLowerCase();
  if (noQuery.endsWith(".svg") || url.toLowerCase().includes(".svg?")) return false;
  if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(noQuery)) return true;
  if (url.startsWith("https://") || url.startsWith("http://")) return true;
  return false;
}

/**
 * Best image URL for Open Graph / Twitter cards, or dynamic PNG fallback route.
 */
export function resolvePartnerProfileOpenGraphImageUrl(
  origin: string,
  slugForQuery: string,
  provider: PartnerProfileOgMedia,
): string {
  const base = origin.replace(/\/$/, "");
  const gallery = Array.isArray(provider.gallery) ? provider.gallery : [];
  const candidates: Array<string | null | undefined> = [
    provider.thumbnail_url,
    provider.avatar_url,
    ...gallery,
  ];
  for (const c of candidates) {
    const abs = toAbsolutePublicUrl(base, c);
    if (abs && isSocialPreviewRasterUrl(abs)) return abs;
  }
  return `${base}/api/public/og/partner-profile?slug=${encodeURIComponent(slugForQuery)}`;
}
