"use client";
import { useState, useEffect } from "react";
import { getPlatformLocale, formatCurrency, parseCurrency, getCurrencySymbol, type LocaleSettings } from "@/lib/locale/currency";

/**
 * React hook to get platform currency settings
 */
export function usePlatformCurrency() {
  const [locale, setLocale] = useState<LocaleSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getPlatformLocale().then((settings) => {
      setLocale(settings);
      setIsLoading(false);
    });
  }, []);

  const format = (amount: number | string, options?: { showSymbol?: boolean; showCode?: boolean }) => {
    if (!locale) return String(amount);
    return formatCurrency(amount, locale.default_currency, options);
  };

  const parse = (currencyString: string) => {
    return parseCurrency(currencyString);
  };

  const symbol = locale ? getCurrencySymbol(locale.default_currency) : "R";
  const code = locale?.default_currency || "ZAR";

  return {
    locale,
    isLoading,
    format,
    parse,
    symbol,
    code,
    currencyInfo: locale?.currency_info,
  };
}
