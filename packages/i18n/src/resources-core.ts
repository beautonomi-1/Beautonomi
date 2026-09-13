import en from "./locales/en.json";
import enGBOverrides from "./locales/en-GB.json";
import enUSOverrides from "./locales/en-US.json";
import enAUOverrides from "./locales/en-AU.json";
import { deepMerge } from "./deep-merge";

export const defaultNS = "translation";
export { deepMerge };

/**
 * Catalogs safe to inline in the web client bundle.
 * Extra locales load on demand via `ensureLocaleResources`.
 */
export const resources = {
  en: { translation: en },
  "en-GB": { translation: deepMerge(en as Record<string, unknown>, enGBOverrides as Record<string, unknown>) },
  "en-US": { translation: deepMerge(en as Record<string, unknown>, enUSOverrides as Record<string, unknown>) },
  "en-AU": { translation: deepMerge(en as Record<string, unknown>, enAUOverrides as Record<string, unknown>) },
} as const;

export const CORE_LOCALE_CODES = ["en", "en-GB", "en-US", "en-AU"] as const;
export type CoreLocaleCode = (typeof CORE_LOCALE_CODES)[number];
