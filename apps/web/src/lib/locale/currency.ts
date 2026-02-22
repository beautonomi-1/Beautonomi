/**
 * Currency and Locale Utilities
 * 
 * Provides functions to format currency and get platform locale settings
 */

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
    default_currency: "ZAR",
    default_language: "en",
    timezone: "Africa/Johannesburg",
    supported_currencies: ["ZAR", "USD", "EUR"],
    supported_languages: ["en", "af", "zu"],
    currency_info: {
      code: "ZAR",
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
  const code = currencyCode || cachedSettings?.default_currency || "ZAR";
  
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

// Listen for settings updates from admin portal
if (typeof window !== "undefined") {
  window.addEventListener("platform-settings-updated", () => {
    clearLocaleCache();
  });
}

// Note: For React hooks, use the usePlatformCurrency hook from @/hooks/usePlatformCurrency
// This file provides the underlying utilities
