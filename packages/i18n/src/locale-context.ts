import type { TextDirection } from "./language-registry";
import {
  buildFormatLocale,
  getLanguageDirection,
  getLanguageMeta,
  normalizeLanguageCode,
  resolveLanguage,
} from "./language-registry";

export type LocaleContextValue = {
  language: string;
  dir: TextDirection;
  formatLocale: string;
  /** ISO 3166-1 alpha-2 market region */
  regionCode: string;
  chargeCurrency: string;
  displayCurrency: string;
  timezone: string;
  /** Tenant allowlist; empty means Wave A (not a lock to English). */
  marketSupportedLanguages: readonly string[];
};

export function buildLocaleContext(params: {
  language: string | null | undefined;
  regionCode: string | null | undefined;
  chargeCurrency: string;
  displayCurrency?: string | null;
  timezone: string;
  marketSupportedLanguages?: readonly string[];
}): LocaleContextValue {
  const regionCode = (params.regionCode ?? "ZA").trim().toUpperCase() || "ZA";
  // Active language is the user's choice (or a normalized code). Do not coerce
  // it through the market allowlist here — a placeholder `["en"]` list would
  // silently snap Afrikaans (and every other pick) back to English in the UI.
  const language = normalizeLanguageCode(params.language);
  const chargeCurrency = params.chargeCurrency.trim().toUpperCase() || "ZAR";
  const displayCurrency =
    (params.displayCurrency?.trim().toUpperCase() || chargeCurrency) || chargeCurrency;

  return {
    language,
    dir: getLanguageDirection(language),
    formatLocale: buildFormatLocale(language, regionCode),
    regionCode,
    chargeCurrency,
    displayCurrency,
    timezone: params.timezone || "Africa/Johannesburg",
    marketSupportedLanguages: params.marketSupportedLanguages ?? [],
  };
}

export {
  buildFormatLocale,
  getLanguageDirection,
  getLanguageMeta,
  normalizeLanguageCode,
  resolveLanguage,
};
