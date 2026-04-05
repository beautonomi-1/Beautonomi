/**
 * Money formatting utilities
 */

export function formatMoney(
  amount: number,
  currency: string = "ZAR",
  locale: string = "en-ZA"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatMoneyCompact(
  amount: number,
  currency: string = "ZAR",
  locale: string = "en-ZA"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function currencySelectLabel(code: string): string {
  return code;
}

/**
 * Minor-unit (cents) helpers for safe arithmetic.
 *
 * IEEE 754 floating-point cannot represent all decimal fractions exactly.
 * Converting to integer cents before arithmetic prevents rounding errors.
 */

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function addMoney(a: number, b: number): number {
  return fromCents(toCents(a) + toCents(b));
}

export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

export function multiplyMoney(amount: number, factor: number): number {
  return fromCents(Math.round(toCents(amount) * factor));
}

export function roundCurrency(amount: number): number {
  return fromCents(Math.round((amount + Number.EPSILON) * 100));
}

/**
 * Compute `amount * percentage / 100` without floating-point drift.
 * E.g. percentOf(200, 15) → 30.00 (15% of R200).
 */
export function percentOf(amount: number, percentage: number): number {
  return fromCents(Math.round(toCents(amount) * percentage / 100));
}

/**
 * Sum an arbitrary number of monetary values safely.
 */
export function sumMoney(...amounts: number[]): number {
  const totalCents = amounts.reduce((acc, a) => acc + toCents(a), 0);
  return fromCents(totalCents);
}
