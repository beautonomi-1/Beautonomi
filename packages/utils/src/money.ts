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

let defaultMoneyLocale = "en-ZA";

/** Set once per session by LocaleProvider (web / mobile). */
export function setDefaultMoneyLocale(locale: string): void {
  const trimmed = locale?.trim();
  if (trimmed) defaultMoneyLocale = trimmed;
}

export function getDefaultMoneyLocale(): string {
  return defaultMoneyLocale;
}

export function formatMoney(
  amount: number,
  currency: string = "ZAR",
  locale: string = defaultMoneyLocale,
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
  locale: string = defaultMoneyLocale,
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

const DEFAULT_TIP_PERCENT_PRESETS = [10, 15, 20, 25] as const;
const MAX_TIP_PERCENT_PRESET_COUNT = 5;

/**
 * Provider tip preset percentages for checkout UI (1–100, max 5, sorted).
 */
export function normalizeTipPercentPresets(input: unknown): number[] {
  if (!Array.isArray(input)) {
    return [...DEFAULT_TIP_PERCENT_PRESETS];
  }
  const seen = new Set<number>();
  const valid: number[] = [];
  for (const item of input) {
    const n = Number(item);
    if (!Number.isFinite(n) || n <= 0 || n > 100) continue;
    const rounded = Math.round(n * 100) / 100;
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    valid.push(rounded);
  }
  valid.sort((a, b) => a - b);
  if (valid.length === 0) {
    return [...DEFAULT_TIP_PERCENT_PRESETS];
  }
  return valid.slice(0, MAX_TIP_PERCENT_PRESET_COUNT);
}

/** Validates provider PATCH body: 1–5 percents in (0, 100]. Returns null if invalid. */
export function validateTipPercentPresetsForSave(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_TIP_PERCENT_PRESET_COUNT) {
    return null;
  }
  for (const item of input) {
    const n = Number(item);
    if (!Number.isFinite(n) || n <= 0 || n > 100) {
      return null;
    }
  }
  return normalizeTipPercentPresets(input);
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
