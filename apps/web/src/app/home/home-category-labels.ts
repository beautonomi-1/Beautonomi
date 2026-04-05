/**
 * Human-readable labels for `?category=` (aligned with service-categories-nav fallbacks).
 * Unknown slugs get title-cased segments.
 */
const SLUG_TO_LABEL: Record<string, string> = {
  hair: "Hair",
  nails: "Nails",
  braids: "Braids",
  makeup: "Makeup",
  massage: "Massage",
  dreadlocks: "Dreadlocks",
  "brows-lashes": "Brows & Lashes",
  "natural-hair": "Natural Hair",
  "wigs-weaves": "Wigs & Weaves",
  "skin-facials": "Skin & Facials",
  "hair-removal": "Hair Removal",
  barber: "Barber",
  spa: "Spa",
};

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Normalized category slug: `"all"` or trimmed non-empty string */
export function normalizeHomeCategoryParam(category: string | undefined): "all" | string {
  const t = category?.trim();
  if (!t || t.toLowerCase() === "all") return "all";
  return t;
}

export function getCategoryLabelForSeo(slug: "all" | string): string {
  if (slug === "all") return "Beauty services";
  const key = slug.toLowerCase();
  return SLUG_TO_LABEL[key] ?? titleCaseSlug(key);
}

export function homePathWithCategory(slug: "all" | string): string {
  if (slug === "all") return "/";
  return `/?category=${encodeURIComponent(slug)}`;
}
