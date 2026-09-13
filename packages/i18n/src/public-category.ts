/**
 * Map provider-authored category names onto catalog slugs we actually translate.
 *
 * Providers type whatever they want ("Hair Services", "Haar", "Nail salon").
 * We do not machine-translate free text — we resolve a known catalog slug and
 * look up `web.categories.<slug>`. Unrecognised names stay as the provider wrote them.
 */

export const PUBLIC_CATEGORY_SLUGS = [
  "hair",
  "nails",
  "braids",
  "makeup",
  "massage",
  "dreadlocks",
  "brows-lashes",
  "natural-hair",
  "wigs-weaves",
  "skin-facials",
  "hair-removal",
  "barber",
  "spa",
  "barbering",
  "skincare",
  "lashes",
  "body",
  "beauty-services",
  "afro",
] as const;

export type PublicCategorySlug = (typeof PUBLIC_CATEGORY_SLUGS)[number];

const SLUG_SET = new Set<string>(PUBLIC_CATEGORY_SLUGS);

/** Longer / more specific slugs win when several tokens match. */
const SPECIFICITY: Record<string, number> = {
  "hair-removal": 24,
  "brows-lashes": 24,
  "natural-hair": 22,
  "wigs-weaves": 22,
  "skin-facials": 22,
  dreadlocks: 20,
  barbering: 18,
  skincare: 18,
  "beauty-services": 12,
  lashes: 16,
  braids: 16,
  makeup: 16,
  massage: 16,
  barber: 16,
  nails: 16,
  afro: 16,
  hair: 14,
  spa: 10,
  body: 6,
};

const ALIASES: Record<string, PublicCategorySlug> = {
  haar: "hair",
  cheveux: "hair",
  cabello: "hair",
  cabelo: "hair",
  nywele: "hair",
  inwele: "hair",
  hairstyling: "hair",
  "hair-styling": "hair",
  "hair-care": "hair",
  "hair-services": "hair",
  "hair-service": "hair",
  haircut: "hair",
  haircuts: "hair",
  "hair-cut": "hair",
  "hair-cuts": "hair",
  salon: "hair",

  naels: "nails",
  nagel: "nails",
  nagels: "nails",
  ongles: "nails",
  unas: "nails",
  uñas: "nails",
  manicure: "nails",
  pedicure: "nails",
  "nail-services": "nails",
  "nail-service": "nails",
  "nail-salon": "nails",
  nail: "nails",

  braiding: "braids",
  cornrows: "braids",
  "box-braids": "braids",
  knotless: "braids",
  "knotless-braids": "braids",
  imicholo: "braids",

  "make-up": "makeup",
  "make up": "makeup",
  glam: "makeup",
  mua: "makeup",
  maquillage: "makeup",
  maquillaje: "makeup",
  maquiagem: "makeup",

  massages: "massage",
  "body-massage": "massage",
  "deep-tissue": "massage",
  "swedish-massage": "massage",

  dreads: "dreadlocks",
  locs: "dreadlocks",
  loc: "dreadlocks",

  brows: "brows-lashes",
  brow: "brows-lashes",
  eyebrows: "brows-lashes",
  eyelashes: "brows-lashes",
  "brows-and-lashes": "brows-lashes",
  "brow-lash": "brows-lashes",

  "natural": "natural-hair",
  "4c": "natural-hair",
  "textured-hair": "natural-hair",
  "afro-hair": "afro",
  "afro-texture": "afro",

  wig: "wigs-weaves",
  wigs: "wigs-weaves",
  weave: "wigs-weaves",
  weaves: "wigs-weaves",
  "wigs-and-weaves": "wigs-weaves",

  skin: "skin-facials",
  facial: "skin-facials",
  facials: "skin-facials",
  "skin-and-facials": "skin-facials",
  face: "skin-facials",

  waxing: "hair-removal",
  wax: "hair-removal",
  laser: "hair-removal",
  sugaring: "hair-removal",
  "hair-removal-services": "hair-removal",

  barbers: "barber",
  barbershop: "barber",
  fade: "barber",

  "day-spa": "spa",
  wellness: "spa",

  "skin-care": "skincare",

  lash: "lashes",
  "lash-extensions": "lashes",

  "body-treatments": "body",
  "body-treatment": "body",

  beauty: "beauty-services",
  "beauty-service": "beauty-services",
};

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeCategoryKey(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function scoreMatch(gram: string, slug: string): number {
  return gram.split("-").filter(Boolean).length * 10 + (SPECIFICITY[slug] ?? 8);
}

export function resolvePublicCategorySlug(
  ...candidates: Array<string | null | undefined>
): PublicCategorySlug | null {
  // Separate locals so TS can see updates from the inner `consider` callback.
  let bestSlug: PublicCategorySlug | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const key = normalizeCategoryKey(candidate ?? "");
    if (!key || key === "all") continue;

    const consider = (gram: string) => {
      const slug = (SLUG_SET.has(gram) ? gram : ALIASES[gram]) as PublicCategorySlug | undefined;
      if (!slug) return;
      const score = scoreMatch(gram, slug);
      if (score > bestScore) {
        bestSlug = slug;
        bestScore = score;
      }
    };

    consider(key);
    const tokens = key.split("-").filter(Boolean);
    for (let len = tokens.length; len >= 1; len--) {
      for (let i = 0; i + len <= tokens.length; i++) {
        consider(tokens.slice(i, i + len).join("-"));
      }
    }
  }

  return bestSlug;
}

type Translate = (key: string, options?: { defaultValue?: string }) => string;

export type CategoryNameI18n = Record<string, string>;

export type TranslatePublicCategoryOptions = {
  /** Admin-authored per-locale names from `global_service_categories.name_i18n`. */
  nameI18n?: CategoryNameI18n | null;
  /** Active UI language (e.g. `de`, `pt-BR`) used to pick from `nameI18n`. */
  language?: string | null;
};

function catalogTranslation(t: Translate, slug: string): string | null {
  const key = `web.categories.${slug}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return null;
}

export function pickCategoryNameI18n(
  map: CategoryNameI18n | null | undefined,
  language?: string | null,
): string | undefined {
  if (!map || typeof map !== "object") return undefined;

  const lookup = (code: string | null | undefined): string | undefined => {
    if (!code) return undefined;
    const direct = map[code];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const lower = code.toLowerCase();
    for (const [key, value] of Object.entries(map)) {
      if (key.toLowerCase() === lower && typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  };

  const lang = (language ?? "").trim();
  return lookup(lang) || lookup(lang.split("-")[0]);
}

export function translatePublicCategoryLabel(
  t: Translate,
  slug?: string | null,
  fallbackName?: string | null,
  options?: TranslatePublicCategoryOptions,
): string {
  const normalized = normalizeCategoryKey(slug || fallbackName || "");
  if (!normalized || normalized === "all") {
    return t("web.layout.header.allCategories");
  }

  const resolved = resolvePublicCategorySlug(slug, fallbackName);
  if (resolved) {
    const fromCatalog = catalogTranslation(t, resolved);
    if (fromCatalog) return fromCatalog;
  }

  // Admin-created slugs: `web.categories.<slug>` if a locale file has it.
  const fromSlugKey = catalogTranslation(t, normalized);
  if (fromSlugKey) return fromSlugKey;

  const fromAdminI18n = pickCategoryNameI18n(options?.nameI18n, options?.language);
  if (fromAdminI18n) return fromAdminI18n;

  const fallback = fallbackName?.trim();
  return fallback || titleCaseSlug(normalized);
}
