/**
 * ISO 4217 currency metadata — single source for minor units and display hints.
 * Used by money.ts for safe arithmetic; extend when launching new markets.
 */

export type CurrencyMeta = {
  code: string;
  /** ISO 4217 minor unit decimal places (0 = JPY, 2 = ZAR/USD, 3 = KWD). */
  minorUnits: number;
  symbol?: string;
};

/** Launch currencies + common expansion targets. Unknown codes fall back to 2 decimals. */
export const CURRENCY_CATALOG: Record<string, CurrencyMeta> = {
  ZAR: { code: "ZAR", minorUnits: 2, symbol: "R" },
  NGN: { code: "NGN", minorUnits: 2, symbol: "₦" },
  GHS: { code: "GHS", minorUnits: 2, symbol: "GH₵" },
  KES: { code: "KES", minorUnits: 2, symbol: "KSh" },
  XOF: { code: "XOF", minorUnits: 0, symbol: "CFA" },
  GBP: { code: "GBP", minorUnits: 2, symbol: "£" },
  EUR: { code: "EUR", minorUnits: 2, symbol: "€" },
  USD: { code: "USD", minorUnits: 2, symbol: "$" },
  JPY: { code: "JPY", minorUnits: 0, symbol: "¥" },
  KWD: { code: "KWD", minorUnits: 3, symbol: "KD" },
  BHD: { code: "BHD", minorUnits: 3, symbol: "BD" },
};

const MINOR_UNIT_FALLBACK = 2;

export function normalizeCurrencyCode(currency: string | null | undefined): string {
  return (currency ?? "ZAR").trim().toUpperCase() || "ZAR";
}

export function getCurrencyMeta(currency: string | null | undefined): CurrencyMeta {
  const code = normalizeCurrencyCode(currency);
  return CURRENCY_CATALOG[code] ?? { code, minorUnits: MINOR_UNIT_FALLBACK };
}

export function minorUnitFactor(currency: string | null | undefined): number {
  const { minorUnits } = getCurrencyMeta(currency);
  return 10 ** minorUnits;
}

export function currencySelectLabel(code: string): string {
  const meta = getCurrencyMeta(code);
  return meta.symbol ? `${code} (${meta.symbol})` : code;
}
