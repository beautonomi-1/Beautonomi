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
 * Legacy `global_service_categories.icon` component names → static image paths under apps/web/public.
 * Used when DB still stores Beautonomi* / Lucide keys instead of `/images/...` paths.
 */
export const LEGACY_GLOBAL_CATEGORY_ICON_PATHS: Record<string, string> = {
  BeautonomiHair: "/images/icons8-hair-dryer-80.svg",
  BeautonomiNails: "/images/nail-art.svg",
  BeautonomiBraids: "/images/braids.svg",
  BeautonomiMakeup: "/images/makeup.svg",
  BeautonomiMassage: "/images/massage.svg",
  BeautonomiDreadlocks: "/images/dreadlocks.svg",
  BeautonomiBrowsLashes: "/images/mascara.svg",
  BeautonomiNaturalHair: "/images/afro-natural-hair.svg",
  BeautonomiWigsWeaves: "/images/curling-hair.svg",
  BeautonomiSkinFacials: "/images/facial-treatment.svg",
  BeautonomiHairRemoval: "/images/wax.svg",
  BeautonomiBarber: "/images/barbershop.svg",
  BeautonomiSpa: "/images/facial.svg",
  Scissors: "/images/icons8-hair-dryer-80.svg",
  Hand: "/images/nail-art.svg",
  Braids: "/images/braids.svg",
  Palette: "/images/makeup.svg",
  Activity: "/images/massage.svg",
  Waves: "/images/dreadlocks.svg",
  Sparkles: "/images/mascara.svg",
  Leaf: "/images/afro-natural-hair.svg",
  Layers: "/images/curling-hair.svg",
  ScanFace: "/images/facial-treatment.svg",
  Zap: "/images/wax.svg",
  Shirt: "/images/barbershop.svg",
  Flower2: "/images/facial.svg",
  Tag: "/images/tag.svg",
};

function normalizeLegacyIconKey(icon: string): string {
  return icon.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Resolve legacy component-name icons to a root-relative image path, if known. */
export function resolveLegacyGlobalCategoryIconPath(icon: string | null | undefined): string | null {
  if (!icon?.trim()) return null;
  const s = icon.trim();
  if (s.startsWith("/") || s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) {
    return null;
  }
  if (LEGACY_GLOBAL_CATEGORY_ICON_PATHS[s]) {
    return LEGACY_GLOBAL_CATEGORY_ICON_PATHS[s];
  }
  const normalized = normalizeLegacyIconKey(s);
  for (const [key, path] of Object.entries(LEGACY_GLOBAL_CATEGORY_ICON_PATHS)) {
    if (normalizeLegacyIconKey(key) === normalized) {
      return path;
    }
  }
  return null;
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

  const origin = webOrigin.replace(/\/$/, "").trim();
  const path = s.startsWith("/") ? s : resolveLegacyGlobalCategoryIconPath(s);
  if (!path) return null;
  if (!origin) return null;
  return withGlobalCategoryIconCacheBust(`${origin}${path}`);
}
