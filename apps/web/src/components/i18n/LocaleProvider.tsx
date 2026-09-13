"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildLocaleContext,
  createI18nInstance,
  ensureLocaleResources,
  I18nextProvider,
  initI18n,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguageCode,
  resolveLanguage,
  type I18nInstance,
  type LocaleContextValue,
} from "@beautonomi/i18n";
import { normalizeCurrencyCode, setDefaultMoneyLocale } from "@beautonomi/utils";
import { useCookieConsent } from "@/providers/CookieConsentProvider";
import { DISPLAY_CURRENCY_STORAGE_KEY, parseDisplayCurrencyCookie } from "@/lib/locale/display-currency-cookie";
import { parseLanguageCookie } from "@/lib/locale/locale-cookie";
import { persistClientLanguage } from "@/lib/locale/persist-client-language";

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback outside provider — safe defaults, no market languages.
    // Components using this fallback won't get market-restricted language lists,
    // but will still render correctly with ZA/en defaults.
    return buildLocaleContext({
      language: "en",
      regionCode: "ZA",
      chargeCurrency: "ZAR",
      timezone: "Africa/Johannesburg",
      marketSupportedLanguages: [],
    });
  }
  return ctx;
}

type LocaleProviderProps = {
  children: ReactNode;
  initial: {
    language: string;
    dir: "ltr" | "rtl";
    formatLocale: string;
    regionCode: string;
    chargeCurrency?: string;
    displayCurrency?: string;
    timezone?: string;
    marketSupportedLanguages?: readonly string[];
  };
};

/**
 * Picks the i18next instance for this render.
 *  - Server: an isolated per-request instance so concurrent requests in different
 *    languages never share state.
 *  - Client: the process singleton (also used by non-React modules via `i18n.t`),
 *    initialised synchronously so the first paint already has translated copy and
 *    matches the server HTML (no raw-key flash, no hydration mismatch).
 */
function acquireI18n(language: string): I18nInstance {
  if (typeof window === "undefined") return createI18nInstance(language);
  return initI18n(language);
}

export function LocaleProvider({ children, initial }: LocaleProviderProps) {
  const { isReady, allowsFunctional } = useCookieConsent();

  // eslint-disable-next-line react-hooks/exhaustive-deps -- instance is created once per mount
  const i18nInstance = useMemo(() => acquireI18n(initial.language), []);
  const [language, setLanguage] = useState(() => normalizeLanguageCode(initial.language));
  const [displayCurrency, setDisplayCurrency] = useState(() =>
    normalizeCurrencyCode(initial.displayCurrency ?? initial.chargeCurrency ?? "ZAR"),
  );
  const lastServerLanguageRef = useRef(normalizeLanguageCode(initial.language));
  const lastServerDisplayCurrencyRef = useRef(
    normalizeCurrencyCode(initial.displayCurrency ?? initial.chargeCurrency ?? "ZAR"),
  );

  useEffect(() => {
    const next = normalizeLanguageCode(initial.language);
    void ensureLocaleResources(i18nInstance, next).then(() => {
      if (normalizeLanguageCode(i18nInstance.language) !== next) {
        void i18nInstance.changeLanguage(next);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load the SSR language once on mount
  }, [i18nInstance]);

  // Follow live language changes (LanguageSelector, preferences page, other tabs).
  useEffect(() => {
    const onChange = (lng: string) => setLanguage(normalizeLanguageCode(lng));
    i18nInstance.on("languageChanged", onChange);
    if (i18nInstance.language && normalizeLanguageCode(i18nInstance.language) !== language) {
      onChange(i18nInstance.language);
    }
    return () => {
      i18nInstance.off("languageChanged", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once
  }, [i18nInstance]);

  // Apply server language only when the *server* value changes (cookie refresh
  // across hosts). Never snap a live client pick back to a stale default.
  useEffect(() => {
    const next = normalizeLanguageCode(initial.language);
    if (next === lastServerLanguageRef.current) return;
    lastServerLanguageRef.current = next;
    if (normalizeLanguageCode(i18nInstance.language) !== next) {
      void ensureLocaleResources(i18nInstance, next).then(() => i18nInstance.changeLanguage(next));
    }
  }, [initial.language, i18nInstance]);

  useEffect(() => {
    const next = normalizeCurrencyCode(initial.displayCurrency ?? initial.chargeCurrency ?? "ZAR");
    if (next === lastServerDisplayCurrencyRef.current) return;
    lastServerDisplayCurrencyRef.current = next;
    setDisplayCurrency(next);
  }, [initial.displayCurrency, initial.chargeCurrency]);

  useEffect(() => {
    const onCurrencyChange = (e: Event) => {
      const detail = (e as CustomEvent<{ currency?: string }>).detail;
      if (detail?.currency) setDisplayCurrency(normalizeCurrencyCode(detail.currency));
    };
    window.addEventListener("beautonomi:preferred-display-currency-changed", onCurrencyChange);
    return () => {
      window.removeEventListener("beautonomi:preferred-display-currency-changed", onCurrencyChange);
    };
  }, []);

  useEffect(() => {
    const onLanguageChange = (e: Event) => {
      const detail = (e as CustomEvent<{ language?: string }>).detail;
      if (!detail?.language) return;
      const next = normalizeLanguageCode(detail.language);
      setLanguage(next);
      if (normalizeLanguageCode(i18nInstance.language) !== next) {
        void ensureLocaleResources(i18nInstance, next).then(() => i18nInstance.changeLanguage(next));
      }
    };
    window.addEventListener("beautonomi:preferred-language-changed", onLanguageChange);
    return () => {
      window.removeEventListener("beautonomi:preferred-language-changed", onLanguageChange);
    };
  }, [i18nInstance]);

  const value = useMemo(
    () =>
      buildLocaleContext({
        language,
        regionCode: initial.regionCode,
        chargeCurrency: initial.chargeCurrency ?? "ZAR",
        displayCurrency,
        timezone: initial.timezone ?? "Africa/Johannesburg",
        marketSupportedLanguages: initial.marketSupportedLanguages,
      }),
    [
      language,
      initial.regionCode,
      initial.chargeCurrency,
      displayCurrency,
      initial.timezone,
      initial.marketSupportedLanguages,
    ],
  );

  // Keep <html lang dir> and money formatting aligned with the active language.
  useEffect(() => {
    document.documentElement.lang = value.language;
    document.documentElement.dir = value.dir;
    setDefaultMoneyLocale(value.formatLocale);
  }, [value.language, value.dir, value.formatLocale]);

  // Cookie is the SSR source of truth. Only restore from localStorage when
  // `bt_lang` is missing (cleared cookie / first client paint).
  useEffect(() => {
    if (!isReady || !allowsFunctional || typeof window === "undefined") return;
    const cookieLang = parseLanguageCookie(document.cookie);
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (cookieLang) {
      if (stored !== cookieLang) {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, cookieLang);
      }
      if (cookieLang !== normalizeLanguageCode(i18nInstance.language)) {
        void ensureLocaleResources(i18nInstance, cookieLang).then(() =>
          i18nInstance.changeLanguage(cookieLang),
        );
      }
      return;
    }
    if (!stored) return;
    const resolved = resolveLanguage(stored, initial.marketSupportedLanguages ?? []);
    persistClientLanguage(resolved);
    if (resolved !== normalizeLanguageCode(i18nInstance.language)) {
      void ensureLocaleResources(i18nInstance, resolved).then(() => i18nInstance.changeLanguage(resolved));
    }
  }, [isReady, allowsFunctional, initial.marketSupportedLanguages, i18nInstance]);

  useEffect(() => {
    if (!isReady || !allowsFunctional || typeof window === "undefined") return;
    const cookieCurrency = parseDisplayCurrencyCookie(document.cookie);
    const stored = localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
    if (cookieCurrency) {
      if (stored !== cookieCurrency) {
        localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, cookieCurrency);
      }
      setDisplayCurrency((current) => (current === cookieCurrency ? current : cookieCurrency));
      return;
    }
    if (!stored) return;
    const resolved = normalizeCurrencyCode(stored);
    setDisplayCurrency((current) => (current === resolved ? current : resolved));
  }, [isReady, allowsFunctional]);

  return (
    <I18nextProvider i18n={i18nInstance}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </I18nextProvider>
  );
}
