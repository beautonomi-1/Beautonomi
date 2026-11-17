import { z } from "zod";

/**
 * Bounds for money amounts that a client may legitimately supply (provider-
 * entered additional charges, free-form top-ups). Entity-backed charges
 * (bookings, orders, additional charges) must always be derived server-side;
 * these bounds are the last line of defence for the remaining free-form paths.
 *
 * F-07 / F2-25.
 */
export const MAX_CLIENT_AMOUNT_MAJOR = 100_000;
/** Catalog prices (products) — matches the DB CHECK added in 10138. */
export const MAX_PRODUCT_PRICE_MAJOR = 1_000_000;
/** Ads CPC free-form budget floor (packs use catalog prices). */
export const MIN_ADS_CPC_BUDGET_MAJOR = 10;

/**
 * F3-09: unpaid drafts may send budget 0. Paid CPC budgets must sit in
 * [MIN_ADS_CPC_BUDGET_MAJOR, MAX_CLIENT_AMOUNT_MAJOR] with ≤2 decimals.
 */
export function adsCpcBudgetError(budget: number): string | null {
  if (!Number.isFinite(budget) || budget < 0) {
    return "CPC budget must be 0 or a positive amount";
  }
  if (budget === 0) return null;
  if (
    budget < MIN_ADS_CPC_BUDGET_MAJOR ||
    budget > MAX_CLIENT_AMOUNT_MAJOR ||
    !hasAtMostTwoDecimals(budget)
  ) {
    return `CPC budget must be between ${MIN_ADS_CPC_BUDGET_MAJOR} and ${MAX_CLIENT_AMOUNT_MAJOR} with at most 2 decimal places.`;
  }
  return null;
}
/** Same cap expressed in minor units (cents / kobo). */
export const MAX_CLIENT_AMOUNT_MINOR = MAX_CLIENT_AMOUNT_MAJOR * 100;

export function hasAtMostTwoDecimals(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}

/** Major-unit amount: positive, ≤ 2 decimal places, ≤ MAX_CLIENT_AMOUNT_MAJOR. */
export const clientMajorAmountSchema = z
  .number()
  .finite()
  .positive("Amount must be positive")
  .max(MAX_CLIENT_AMOUNT_MAJOR, `Amount must be at most ${MAX_CLIENT_AMOUNT_MAJOR}`)
  .refine(hasAtMostTwoDecimals, "Amount must have at most 2 decimal places");

/** Minor-unit amount: positive integer, ≤ MAX_CLIENT_AMOUNT_MINOR. */
export const clientMinorAmountSchema = z
  .number()
  .int("Amount must be a whole number of minor units")
  .positive("Amount must be positive")
  .max(MAX_CLIENT_AMOUNT_MINOR, `Amount must be at most ${MAX_CLIENT_AMOUNT_MINOR}`);
