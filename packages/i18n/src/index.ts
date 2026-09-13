import i18n, { createInstance, type i18n as I18nInstance, type InitOptions } from "i18next";
import { FALLBACK_LNG_MAP, getLanguageMeta, LANGUAGE_STORAGE_KEY, LANGUAGE_COOKIE } from "./language-registry";
import { defaultNS, resources } from "./resources-core";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_SUPPORTED_LANGUAGE_CODES,
  supportedLanguages,
  languagesForMarket,
  type SupportedLanguage,
  normalizeLanguageCode,
  isSupportedLanguageCode,
  resolveLanguage,
  buildFormatLocale,
  getLanguageDirection,
  mergeLanguagePickerOptions,
  isRegistryLanguage,
  preferredLanguageFromDevice,
} from "./language-registry";

export { defaultNS };

export {
  DEFAULT_LANGUAGE,
  DEFAULT_SUPPORTED_LANGUAGE_CODES,
  supportedLanguages,
  languagesForMarket,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_COOKIE,
  FALLBACK_LNG_MAP,
  getLanguageMeta,
  normalizeLanguageCode,
  isSupportedLanguageCode,
  resolveLanguage,
  buildFormatLocale,
  getLanguageDirection,
  mergeLanguagePickerOptions,
  isRegistryLanguage,
  preferredLanguageFromDevice,
};
export type { SupportedLanguage, LanguageMeta, TextDirection, LanguageWave } from "./language-registry";
export {
  PUBLIC_CATEGORY_SLUGS,
  normalizeCategoryKey,
  resolvePublicCategorySlug,
  translatePublicCategoryLabel,
  pickCategoryNameI18n,
} from "./public-category";
export type {
  PublicCategorySlug,
  CategoryNameI18n,
  TranslatePublicCategoryOptions,
} from "./public-category";
export type { LocaleContextValue } from "./locale-context";
export { buildLocaleContext } from "./locale-context";
export { resources, deepMerge } from "./resources-core";
export { ensureLocaleResources, setExtraLocaleLoader, loadLocaleMessages } from "./load-locale";

/** Values stored in users.signup_source. Must match backend allowed list in apps/web profile PATCH. */
export const SIGNUP_SOURCE_OPTIONS = [
  { value: "google", labelKey: "auth.signupSourceGoogle" },
  { value: "social_instagram", labelKey: "auth.signupSourceInstagram" },
  { value: "social_facebook", labelKey: "auth.signupSourceFacebook" },
  { value: "social_twitter", labelKey: "auth.signupSourceTwitter" },
  { value: "friend_or_family", labelKey: "auth.signupSourceFriend" },
  { value: "blog_or_article", labelKey: "auth.signupSourceBlog" },
  { value: "app_store", labelKey: "auth.signupSourceAppStore" },
  { value: "provider_referral", labelKey: "auth.signupSourceProviderReferral" },
  { value: "other", labelKey: "auth.signupSourceOther" },
] as const;
export type SignupSourceValue = (typeof SIGNUP_SOURCE_OPTIONS)[number]["value"];

let initialized = false;

/** Shared init options. Resources are bundled, so `init` completes synchronously. */
export function buildInitOptions(lng: string): InitOptions {
  return {
    resources,
    lng: normalizeLanguageCode(lng),
    fallbackLng: FALLBACK_LNG_MAP,
    defaultNS,
    // Keep plural/namespace resolution strict; missing keys fall back to English via fallbackLng.
    returnNull: false,
    returnEmptyString: false,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
      bindI18n: "languageChanged loaded",
      bindI18nStore: "added",
    },
  };
}

/**
 * Initialise (or re-target) the process-wide singleton. Safe to call during render on the
 * client: with bundled resources i18next initialises synchronously, so `t()` works on the
 * very first paint (no key flash). Do NOT use the singleton for server rendering of
 * per-request languages — use `createI18nInstance` instead.
 */
export function initI18n(lng: string = "en") {
  const resolved = normalizeLanguageCode(lng);
  if (initialized) {
    // Do not clobber a live client language when LocaleProvider remounts
    // with a stale server default (cookie not visible yet / RSC refresh).
    return i18n;
  }

  // Lazy-load react-i18next so RSC/server importers of registry-only symbols never pull createContext.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initReactI18next } = require("react-i18next") as typeof import("react-i18next");
  i18n.use(initReactI18next).init(buildInitOptions(resolved));

  initialized = true;
  return i18n;
}

/**
 * Isolated instance for server rendering (Next.js RSC/SSR). Each request gets its own
 * language without touching the shared singleton, so concurrent requests in different
 * languages never leak into each other. Pair with `<I18nextProvider i18n={instance}>`.
 */
export function createI18nInstance(lng: string = "en"): I18nInstance {
  const instance = createInstance();
  instance.init(buildInitOptions(lng));
  return instance;
}

export { i18n };
export { useTranslation, I18nextProvider } from "./client";
export type { I18nInstance };
export type { TFunction } from "i18next";

export type {
  CancellationPolicyView,
  CancellationPolicyLine,
  CancellationPolicyContent,
  PolicyLineTone,
} from "./cancellation";
export { buildCancellationPolicyLines, cancellationRequiresAck } from "./cancellation";
