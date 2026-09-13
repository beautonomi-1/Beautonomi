import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { buildFormatLocale, getLanguageDirection, LANGUAGE_COOKIE, resolveLanguage } from "@beautonomi/i18n/language-registry";
import { normalizeCurrencyCode } from "@beautonomi/utils";
import { parseLanguageCookie } from "@/lib/locale/locale-cookie";
import { DISPLAY_CURRENCY_COOKIE, parseDisplayCurrencyCookie } from "@/lib/locale/display-currency-cookie";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { getTenantScopedCurrencyPreferenceOptions } from "@/lib/preferences/tenant-currency-options";

export type RequestLanguageContext = {
  language: string;
  dir: "ltr" | "rtl";
  formatLocale: string;
  regionCode: string;
  chargeCurrency: string;
  displayCurrency: string;
  timezone: string;
  marketSupportedLanguages: string[];
};

/** Server-side language for RSC layout, metadata, and getServerT. */
export async function resolveRequestLanguage(): Promise<RequestLanguageContext> {
  const headersList = await headers();
  const cookieStore = await cookies();
  const cookieLang =
    parseLanguageCookie(cookieStore.get(LANGUAGE_COOKIE)?.value ?? null) ??
    parseLanguageCookie(headersList.get("cookie"));

  let marketSupported: string[] = [];
  let regionCode = "ZA";
  let defaultLanguage = "en";
  let chargeCurrency = "ZAR";
  let timezone = "Africa/Johannesburg";

  try {
    const req = new Request("https://placeholder", {
      headers: Object.fromEntries(headersList.entries()),
    });
    const tenantId = await resolveTenantIdWithZaFallback(req);
    const regionConfig = await getTenantRegionConfig(tenantId);
    if (regionConfig) {
      regionCode = regionConfig.regionCode?.trim().toUpperCase() || "ZA";
      defaultLanguage = regionConfig.defaultLanguage || "en";
      marketSupported = regionConfig.supportedLanguages ?? [];
      chargeCurrency = regionConfig.defaultCurrency || chargeCurrency;
      timezone = regionConfig.defaultTimezone || timezone;
    }
  } catch {
    // fall through to cookie / default
  }

  const language = resolveLanguage(cookieLang ?? defaultLanguage, marketSupported);
  const dir = getLanguageDirection(language);
  const formatLocale = buildFormatLocale(language, regionCode);

  const cookieDisplay =
    parseDisplayCurrencyCookie(cookieStore.get(DISPLAY_CURRENCY_COOKIE)?.value ?? null) ??
    parseDisplayCurrencyCookie(headersList.get("cookie"));

  let displayCurrency = chargeCurrency;
  if (cookieDisplay && cookieDisplay !== chargeCurrency) {
    try {
      const req = new Request("https://placeholder", {
        headers: Object.fromEntries(headersList.entries()),
      }) as NextRequest;
      const options = await getTenantScopedCurrencyPreferenceOptions(req);
      const supported = new Set(options.map((o) => normalizeCurrencyCode(o.code)));
      if (supported.has(cookieDisplay)) {
        displayCurrency = cookieDisplay;
      }
    } catch {
      // fall through to charge currency
    }
  } else if (cookieDisplay) {
    displayCurrency = cookieDisplay;
  }

  return {
    language,
    dir,
    formatLocale,
    regionCode,
    chargeCurrency,
    displayCurrency,
    timezone,
    marketSupportedLanguages: marketSupported,
  };
}
