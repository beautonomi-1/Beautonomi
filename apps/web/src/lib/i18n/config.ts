/**
 * Web i18n configuration — re-exports the canonical registry from @beautonomi/i18n.
 * Do not add duplicate language lists or translation maps here.
 */

export {
  DEFAULT_LANGUAGE,
  DEFAULT_SUPPORTED_LANGUAGE_CODES,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  supportedLanguages as SUPPORTED_LANGUAGES,
  normalizeLanguageCode,
  isSupportedLanguageCode,
  languagesForMarket,
  resolveLanguage,
  buildFormatLocale,
  getLanguageDirection,
  type SupportedLanguage,
} from "@beautonomi/i18n/language-registry";
