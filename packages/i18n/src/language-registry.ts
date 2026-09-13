export type TextDirection = "ltr" | "rtl";

export type LanguageWave = "A" | "B";

export type LanguageMeta = {
  code: string;
  name: string;
  nativeName: string;
  dir: TextDirection;
  wave: LanguageWave;
  /** Overlay base, e.g. pt-BR → pt */
  baseCode?: string;
  /** CLDR plural categories this locale may use in JSON keys */
  pluralCategories: readonly string[];
};

export const LANGUAGE_STORAGE_KEY = "beautonomi_locale";
export const LANGUAGE_COOKIE = "bt_lang";

/** Canonical registry — single source for all apps and API validation. */
export const LANGUAGE_REGISTRY: readonly LanguageMeta[] = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "en-GB", name: "English (UK)", nativeName: "English (UK)", dir: "ltr", wave: "A", baseCode: "en", pluralCategories: ["one", "other"] },
  { code: "en-US", name: "English (US)", nativeName: "English (US)", dir: "ltr", wave: "A", baseCode: "en", pluralCategories: ["one", "other"] },
  { code: "en-AU", name: "English (Australia)", nativeName: "English (Australia)", dir: "ltr", wave: "A", baseCode: "en", pluralCategories: ["one", "other"] },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "zu", name: "Zulu", nativeName: "isiZulu", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "xh", name: "Xhosa", nativeName: "isiXhosa", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "st", name: "Southern Sotho", nativeName: "Sesotho", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "nso", name: "Northern Sotho (Sepedi)", nativeName: "Sesotho sa Leboa", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "tn", name: "Tswana", nativeName: "Setswana", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "ts", name: "Tsonga", nativeName: "Xitsonga", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "ve", name: "Venda", nativeName: "Tshivenda", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "ss", name: "Swati", nativeName: "siSwati", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl", wave: "A", pluralCategories: ["zero", "one", "two", "few", "many", "other"] },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "pt", name: "Portuguese", nativeName: "Português", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)", dir: "ltr", wave: "A", baseCode: "pt", pluralCategories: ["one", "other"] },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr", wave: "A", pluralCategories: ["one", "other"] },
  { code: "es-MX", name: "Spanish (Mexico)", nativeName: "Español (México)", dir: "ltr", wave: "A", baseCode: "es", pluralCategories: ["one", "other"] },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr", wave: "B", pluralCategories: ["one", "other"] },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", dir: "ltr", wave: "B", pluralCategories: ["one", "other"] },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", dir: "ltr", wave: "B", pluralCategories: ["other"] },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", dir: "ltr", wave: "B", pluralCategories: ["one", "other"] },
  { code: "am", name: "Amharic", nativeName: "አማርኛ", dir: "ltr", wave: "B", pluralCategories: ["one", "other"] },
  { code: "rw", name: "Kinyarwanda", nativeName: "Ikinyarwanda", dir: "ltr", wave: "B", pluralCategories: ["one", "other"] },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", dir: "ltr", wave: "B", pluralCategories: ["one", "other"] },
  { code: "it", name: "Italian", nativeName: "Italiano", dir: "ltr", wave: "B", pluralCategories: ["one", "other"] },
] as const;

export type SupportedLanguage = (typeof LANGUAGE_REGISTRY)[number]["code"];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

const registryByCode = new Map<string, LanguageMeta>(
  LANGUAGE_REGISTRY.map((m) => [m.code.toLowerCase(), m]),
);

/** Normalize user/API input to a registry code when possible. */
export function normalizeLanguageCode(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "en";
  const lower = trimmed.toLowerCase().replace(/_/g, "-");
  if (registryByCode.has(lower)) return registryByCode.get(lower)!.code;
  const base = lower.split("-")[0] ?? "en";
  if (registryByCode.has(base)) return registryByCode.get(base)!.code;
  return "en";
}

/**
 * True only when `raw` is (case-insensitively, `_`→`-`) an exact registry code.
 * Use for input validation — `normalizeLanguageCode` silently coerces unknown input to "en".
 */
export function isSupportedLanguageCode(raw: string | null | undefined): raw is SupportedLanguage {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return false;
  return registryByCode.has(trimmed.toLowerCase().replace(/_/g, "-"));
}

export function getLanguageMeta(code: string | null | undefined): LanguageMeta {
  const normalized = normalizeLanguageCode(code);
  return registryByCode.get(normalized.toLowerCase()) ?? registryByCode.get("en")!;
}

export function getLanguageDirection(code: string | null | undefined): TextDirection {
  return getLanguageMeta(code).dir;
}

/**
 * True when `raw` matches a bundled locale (exact or base subtag), without
 * coercing unknown input to English.
 */
export function isRegistryLanguage(raw: string | null | undefined): boolean {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase().replace(/_/g, "-");
  return registryByCode.has(lower) || registryByCode.has(lower.split("-")[0] ?? "");
}

/**
 * Browser/OS language → bundled locale. Unknown tags stay English.
 * A German tourist's phone (`de-DE`) resolves to `de` even on .co.za.
 */
export function preferredLanguageFromDevice(raw: string | null | undefined): SupportedLanguage {
  if (!isRegistryLanguage(raw)) return DEFAULT_LANGUAGE;
  return normalizeLanguageCode(raw) as SupportedLanguage;
}

/**
 * Resolve UI language: any bundled locale the user picked, otherwise market default, else en.
 *
 * Market `supported_languages` is a suggestion list (Wave A when empty), not a lock.
 * Tourists keep Deutsch / Italiano on beautonomi.co.za — same model as Airbnb.
 */
export function resolveLanguage(
  input: string | null | undefined,
  marketSupported: readonly string[] = [],
): SupportedLanguage {
  const trimmed = (input ?? "").trim();
  if (trimmed && isRegistryLanguage(trimmed)) {
    return normalizeLanguageCode(trimmed) as SupportedLanguage;
  }
  if (marketSupported.length > 0) {
    const first = normalizeLanguageCode(marketSupported[0]);
    return first as SupportedLanguage;
  }
  return DEFAULT_LANGUAGE;
}

/** BCP-47 tag for Intl formatting: `{lang}-{region}`. Overlay locales (en-GB, pt-BR) keep their own region. */
export function buildFormatLocale(language: string, regionCode: string | undefined): string {
  const lang = normalizeLanguageCode(language);
  // Overlay locales already carry a region subtag — use it directly.
  if (lang.includes("-")) return lang;
  const region = (regionCode ?? "ZA").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) return `${lang}-ZA`;
  return `${lang}-${region}`;
}

/** i18next fallbackLng map for overlay locales. */
export const FALLBACK_LNG_MAP: Record<string, string[]> = {
  "en-GB": ["en"],
  "en-US": ["en"],
  "en-AU": ["en"],
  "pt-BR": ["pt", "en"],
  "es-MX": ["es", "en"],
  default: ["en"],
};

export const supportedLanguages = LANGUAGE_REGISTRY.map(({ code, name, nativeName, wave }) => ({
  code,
  name,
  nativeName,
  wave,
}));

export const DEFAULT_SUPPORTED_LANGUAGE_CODES: readonly SupportedLanguage[] = LANGUAGE_REGISTRY.filter(
  (l) => l.wave === "A",
).map((l) => l.code as SupportedLanguage);

/**
 * Suggested languages for this market (Wave A when the tenant list is empty).
 * Pickers that tourists use should show `supportedLanguages` (Wave A + B), not only this list.
 */
export function languagesForMarket(marketSupported: readonly string[] = []): typeof supportedLanguages {
  if (marketSupported.length === 0) {
    return supportedLanguages.filter((l) => l.wave === "A");
  }
  const allowed = new Set(marketSupported.map((c) => c.toLowerCase()));
  return supportedLanguages.filter(
    (l) =>
      allowed.has(l.code.toLowerCase()) ||
      allowed.has(l.code.split("-")[0]!.toLowerCase()),
  );
}

/**
 * Merges CMS `preference_options` language rows with bundled locales.
 * Preserves exact codes (en-GB, pt-BR) when present in the registry.
 */
export function mergeLanguagePickerOptions(apiRows: { code: string; name: string }[]): {
  code: string;
  name: string;
}[] {
  const allowedCodes = new Set(supportedLanguages.map((l) => l.code.toLowerCase()));
  const seen = new Set<string>();
  const out: { code: string; name: string }[] = [];

  for (const row of apiRows) {
    const raw = row.code?.trim();
    if (!raw) continue;
    const normalized = normalizeLanguageCode(raw);
    const key = normalized.toLowerCase();
    if (!allowedCodes.has(key) && !allowedCodes.has(key.split("-")[0]!)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = getLanguageMeta(normalized);
    const label = meta ? `${meta.nativeName} (${meta.name})` : (row.name?.trim() || normalized);
    out.push({ code: normalized, name: label });
  }

  for (const { code, nativeName, name } of supportedLanguages) {
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code, name: `${nativeName} (${name})` });
  }

  return out;
}
