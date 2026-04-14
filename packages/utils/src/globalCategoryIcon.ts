/**
 * Bump when global category image assets change so browsers / native Image caches refetch.
 * Web can override per deploy via `NEXT_PUBLIC_CATEGORY_ICON_CACHE_REVISION` (pass into `withGlobalCategoryIconCacheBust`).
 */
export const GLOBAL_CATEGORY_ICON_CACHE_REVISION = "20260414b";

/** Append cache-bust query param (`cic_rev`) for category artwork URLs. */
export function withGlobalCategoryIconCacheBust(href: string, revision?: string): string {
  if (!href || href.startsWith("data:")) return href;
  const rev = (revision?.trim() || GLOBAL_CATEGORY_ICON_CACHE_REVISION).trim();
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}cic_rev=${encodeURIComponent(rev)}`;
}

/**
 * Resolve `global_service_categories.icon` values for React Native / Expo `Image`.
 * Web stores root-relative paths (`/images/foo.png`); native needs an absolute `https` URI.
 * Resolved http(s) URLs include a cache-bust query for updated PNGs/SVGs.
 */
export function resolveGlobalCategoryIconUri(
  icon: string | null | undefined,
  webOrigin: string
): string | null {
  if (!icon?.trim()) return null;
  const s = icon.trim();
  if (s.startsWith("data:")) {
    return s;
  }
  if (s.startsWith("http://") || s.startsWith("https://")) {
    return withGlobalCategoryIconCacheBust(s);
  }
  if (!s.startsWith("/")) {
    // Legacy component names (e.g. BeautonomiHair) or emoji — not loadable as remote URI
    return null;
  }
  const origin = webOrigin.replace(/\/$/, "").trim();
  if (!origin) return null;
  return withGlobalCategoryIconCacheBust(`${origin}${s}`);
}
