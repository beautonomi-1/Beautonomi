/**
 * Money formatting and currency-aware minor-unit arithmetic.
 */

import {
  currencySelectLabel as currencySelectLabelFromCatalog,
  getCurrencyMeta,
  minorUnitFactor,
  normalizeCurrencyCode,
} from "./currencies";

export { currencySelectLabelFromCatalog as currencySelectLabel };

export function formatMoney(
  amount: number,
  currency: string = "ZAR",
  locale: string = "en-ZA",
): string {
  const code = normalizeCurrencyCode(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
  }).format(amount);
}

export function formatMoneyCompact(
  amount: number,
  currency: string = "ZAR",
  locale: string = "en-ZA",
): string {
  const code = normalizeCurrencyCode(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

/**
 * Convert major units → integer minor units (currency-aware).
 */
export function toMinorUnits(amount: number, currency: string = "ZAR"): number {
  const factor = minorUnitFactor(currency);
  return Math.round(amount * factor);
}

/**
 * Convert integer minor units → major units (currency-aware).
 */
export function fromMinorUnits(minor: number, currency: string = "ZAR"): number {
  const factor = minorUnitFactor(currency);
  return minor / factor;
}

/** @deprecated Use toMinorUnits(amount, currency) */
export function toCents(amount: number, currency: string = "ZAR"): number {
  return toMinorUnits(amount, currency);
}

/** @deprecated Use fromMinorUnits(minor, currency) */
export function fromCents(cents: number, currency: string = "ZAR"): number {
  return fromMinorUnits(cents, currency);
}

export function addMoney(a: number, b: number, currency: string = "ZAR"): number {
  return fromMinorUnits(toMinorUnits(a, currency) + toMinorUnits(b, currency), currency);
}

export function subtractMoney(a: number, b: number, currency: string = "ZAR"): number {
  return fromMinorUnits(toMinorUnits(a, currency) - toMinorUnits(b, currency), currency);
}

export function multiplyMoney(amount: number, factor: number, currency: string = "ZAR"): number {
  return fromMinorUnits(Math.round(toMinorUnits(amount, currency) * factor), currency);
}

export function roundCurrency(amount: number, currency: string = "ZAR"): number {
  const meta = getCurrencyMeta(currency);
  const factor = 10 ** meta.minorUnits;
  return fromMinorUnits(Math.round((amount + Number.EPSILON) * factor), currency);
}

export function percentOf(amount: number, percentage: number, currency: string = "ZAR"): number {
  return fromMinorUnits(
    Math.round((toMinorUnits(amount, currency) * percentage) / 100),
    currency,
  );
}

export function sumMoney(currency: string, ...amounts: number[]): number;
export function sumMoney(...amounts: number[]): number;
export function sumMoney(first: string | number, ...rest: number[]): number {
  let currency = "ZAR";
  let amounts: number[];
  if (typeof first === "string") {
    currency = first;
    amounts = rest;
  } else {
    amounts = [first, ...rest];
  }
  const totalMinor = amounts.reduce((acc, a) => acc + toMinorUnits(a, currency), 0);
  return fromMinorUnits(totalMinor, currency);
}

/**
 * Explicit rounding residual when proportional splits must sum to a total.
 * Returns per-line amounts plus a residual line if needed.
 */
export function splitMoneyProportionally(
  total: number,
  weights: number[],
  currency: string = "ZAR",
): { parts: number[]; residual: number } {
  if (weights.length === 0) return { parts: [], residual: 0 };
  const totalMinor = toMinorUnits(total, currency);
  const weightSum = weights.reduce((a, w) => a + w, 0);
  if (weightSum <= 0) {
    return { parts: weights.map(() => 0), residual: fromMinorUnits(totalMinor, currency) };
  }
  const raw = weights.map((w) => Math.floor((totalMinor * w) / weightSum));
  let allocated = raw.reduce((a, n) => a + n, 0);
  let remainder = totalMinor - allocated;
  const parts = [...raw];
  let i = 0;
  while (remainder > 0 && parts.length > 0) {
    parts[i % parts.length]! += 1;
    remainder -= 1;
    i += 1;
  }
  allocated = parts.reduce((a, n) => a + n, 0);
  const residualMinor = totalMinor - allocated;
  return {
    parts: parts.map((p) => fromMinorUnits(p, currency)),
    residual: fromMinorUnits(residualMinor, currency),
  };
}
