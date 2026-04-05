/**
 * Currency and Locale Utilities
 * 
 * Provides functions to format currency and get platform locale settings
 */

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  decimal_places: number;
}

export interface LocaleSettings {
  default_currency: string;
  default_language: string;
  timezone: string;
  supported_currencies: string[];
  supported_languages: string[];
  currency_info?: CurrencyInfo;
}

// Cache for platform settings
let cachedSettings: LocaleSettings | null = null;
let settingsPromise: Promise<LocaleSettings> | null = null;

/**
 * Get platform locale settings
 * Caches the result for performance
 */
export async function getPlatformLocale(): Promise<LocaleSettings> {
  // Return cached if available
  if (cachedSettings) {
    return cachedSettings;
  }

  // Return existing promise if already fetching
  if (settingsPromise) {
    return settingsPromise;
  }

  // Fetch settings
  const promise: Promise<LocaleSettings> = fetch("/api/public/platform-settings")
    .then(async (response) => {
      if (!response.ok) {
        return getDefaultLocale();
      }
      const data = await response.json();
      cachedSettings = data.data || getDefaultLocale();
      return cachedSettings!;
    })
    .catch(() => {
      return getDefaultLocale();
    })
    .finally(() => {
      settingsPromise = null;
    });

  settingsPromise = promise;
  return promise;
}

/**
 * Get default locale settings (fallback)
 */
function getDefaultLocale(): LocaleSettings {
  return {
    default_currency: LAST_RESORT_CURRENCY,
    default_language: "en",
    timezone: "Africa/Johannesburg",
    supported_currencies: [LAST_RESORT_CURRENCY, "USD", "EUR"],
    supported_languages: ["en", "af", "zu"],
    currency_info: {
      code: LAST_RESORT_CURRENCY,
      symbol: "R",
      name: "South African Rand",
      decimal_places: 2,
    },
  };
}

/**
 * Format currency amount
 */
export function formatCurrency(
  amount: number | string,
  currencyCode?: string,
  options?: {
    showSymbol?: boolean;
    showCode?: boolean;
  }
): string {
  const amountNum = typeof amount === "string" ? parseFloat(amount) : amount;
  
  if (isNaN(amountNum)) {
    return "0";
  }

  // If currency code provided, use it; otherwise get from platform settings
  const code = currencyCode || cachedSettings?.default_currency || LAST_RESORT_CURRENCY;
  
  // Currency symbols map
  const currencySymbols: { [key: string]: string } = {
    ZAR: "R",
    USD: "$",
    EUR: "€",
    GBP: "£",
    AED: "د.إ",
    JPY: "¥",
    CNY: "¥",
    INR: "₹",
    AUD: "A$",
    CAD: "C$",
  };

  const symbol = currencySymbols[code] || code;
  const showSymbol = options?.showSymbol !== false;
  const showCode = options?.showCode || false;

  // Format number with appropriate decimal places
  const formatted = amountNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (showCode && !showSymbol) {
    return `${code} ${formatted}`;
  }

  if (showSymbol && !showCode) {
    return `${symbol}${formatted}`;
  }

  if (showCode && showSymbol) {
    return `${symbol}${formatted} (${code})`;
  }

  return formatted;
}

/**
 * Parse currency string to number
 * Handles formats like "ZAR 100", "R100", "$100", etc.
 */
export function parseCurrency(currencyString: string): number {
  if (!currencyString) return 0;

  // Remove currency codes and symbols
  const cleaned = currencyString
    .replace(/[A-Z]{3}\s*/g, "") // Remove currency codes like "ZAR ", "AED "
    .replace(/[R$€£¥₹د.إ]\s*/g, "") // Remove currency symbols
    .replace(/[,\s]/g, "") // Remove commas and spaces
    .trim();

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
  const currencySymbols: { [key: string]: string } = {
    ZAR: "R",
    USD: "$",
    EUR: "€",
    GBP: "£",
    AED: "د.إ",
    JPY: "¥",
    CNY: "¥",
    INR: "₹",
    AUD: "A$",
    CAD: "C$",
  };

  return currencySymbols[currencyCode] || currencyCode;
}

/**
 * Clear cached settings (useful after admin updates)
 */
export function clearLocaleCache(): void {
  cachedSettings = null;
  settingsPromise = null;
}

/**
 * De-duplicated ISO codes for currency `<Select>`: tenant default plus common options.
 * Pass extra codes (e.g. current offer currency when editing) so the value stays selectable.
 */
export function mergeCurrencyChoiceCodes(primary: string, ...alsoInclude: string[]): string[] {
  const p = (primary || LAST_RESORT_CURRENCY).trim().toUpperCase();
  const extras = ["USD", "EUR", "GBP", LAST_RESORT_CURRENCY];
  const more = alsoInclude.map((c) => c.trim().toUpperCase()).filter(Boolean);
  return [...new Set([p, ...extras, ...more])];
}

/**
 * Short label for currency dropdowns, e.g. `ZAR (South African Rand)`.
 */
export function currencySelectLabel(code: string): string {
  const c = (code || LAST_RESORT_CURRENCY).trim().toUpperCase();
  try {
    const name = new Intl.DisplayNames(undefined, { type: "currency" }).of(c);
    return name ? `${c} (${name})` : c;
  } catch {
    return c;
  }
}

// Listen for settings updates from admin portal
if (typeof window !== "undefined") {
  window.addEventListener("platform-settings-updated", () => {
    clearLocaleCache();
  });
}

// Note: For React hooks, use the usePlatformCurrency hook from @/hooks/usePlatformCurrency
// This file provides the underlying utilities
