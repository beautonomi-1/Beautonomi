/**
 * Supported country slugs for /locations/* SEO hubs.
 * `locationCountryMatch` is used in provider_locations.country ilike (DB often stores full names).
 */
export type SeoMarket = {
  slug: string;
  iso2: string;
  name: string;
  /** Match `provider_locations.country` (partial ilike) */
  locationCountryMatch: string;
};

export const SEO_MARKETS: SeoMarket[] = [
  { slug: "south-africa", iso2: "ZA", name: "South Africa", locationCountryMatch: "South Africa" },
  { slug: "kenya", iso2: "KE", name: "Kenya", locationCountryMatch: "Kenya" },
  { slug: "ghana", iso2: "GH", name: "Ghana", locationCountryMatch: "Ghana" },
  { slug: "nigeria", iso2: "NG", name: "Nigeria", locationCountryMatch: "Nigeria" },
  { slug: "egypt", iso2: "EG", name: "Egypt", locationCountryMatch: "Egypt" },
];

const marketBySlug = new Map(SEO_MARKETS.map((m) => [m.slug, m]));
const marketByIso2 = new Map(SEO_MARKETS.map((m) => [m.iso2.toUpperCase(), m]));

export function getSeoMarketByCountrySlug(slug: string): SeoMarket | null {
  return marketBySlug.get(slug.toLowerCase()) ?? null;
}

export function getSeoMarketByIso2(iso2: string): SeoMarket | null {
  return marketByIso2.get(iso2.trim().toUpperCase()) ?? null;
}

/** URL segment → display city (e.g. cape-town → Cape Town) */
export function citySlugToDisplayName(citySlug: string): string {
  return citySlug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Display city → URL slug */
export function cityDisplayToSlug(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const SAFE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidLocationSegment(segment: string): boolean {
  return SAFE_SEGMENT.test(segment) && segment.length <= 80;
}
