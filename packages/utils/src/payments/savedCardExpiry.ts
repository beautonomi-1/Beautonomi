/**
 * Shared helpers for displaying and validating saved-card expiry across web
 * and mobile checkouts.
 *
 * Paystack returns `exp_month` / `exp_year` on the authorization object when
 * a card is tokenized (see Paystack "Recurring Charges" docs). We persist
 * those values on `payment_methods.expiry_month` / `payment_methods.expiry_year`
 * and consumers in the UI should use these helpers to:
 *  - format the expiry consistently (`MM/YY`)
 *  - decide whether a card is expired (past the end of its expiry month)
 *  - decide whether a card is expiring soon (within the next ~60 days), so we
 *    can warn the customer before a charge fails.
 *
 * The "expired" boundary intentionally treats the *end* of the expiry month as
 * the cut-off: a card with exp_month=05 / exp_year=2026 is still usable
 * throughout May 2026 and becomes expired at the start of June 2026 (UTC).
 */

export interface SavedCardExpiryInput {
  expiry_month?: number | string | null;
  expiry_year?: number | string | null;
}

export interface SavedCardExpiryStatus {
  /** True when both month and year were parseable. */
  hasExpiry: boolean;
  /** Two-digit month (1-12). 0 when unknown. */
  month: number;
  /** Four-digit year. 0 when unknown. */
  year: number;
  /** Formatted as `MM/YY`. Empty string when unknown. */
  label: string;
  /** True after the last day of the expiry month (relative to `now`). */
  isExpired: boolean;
  /** True when not yet expired but within `expiringSoonDays` of expiring. */
  isExpiringSoon: boolean;
}

const DEFAULT_EXPIRING_SOON_DAYS = 60;

function coerceInt(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeYear(rawYear: number): number {
  if (rawYear <= 0) return 0;
  if (rawYear < 100) {
    return 2000 + rawYear;
  }
  return rawYear;
}

/**
 * Compute the UTC timestamp that represents the *start* of the month after
 * the card's expiry month. A card is considered expired once `now` reaches
 * (or passes) this instant.
 */
function expiryCutoffMs(month: number, year: number): number {
  return Date.UTC(year, month, 1, 0, 0, 0, 0);
}

/**
 * Format expiry as `MM/YY`. Returns an empty string when month or year are
 * missing/invalid.
 */
export function formatSavedCardExpiry(input: SavedCardExpiryInput): string {
  const month = coerceInt(input.expiry_month);
  const year = normalizeYear(coerceInt(input.expiry_year));
  if (month < 1 || month > 12 || year < 1) return "";
  const mm = String(month).padStart(2, "0");
  const yy = String(year).slice(-2);
  return `${mm}/${yy}`;
}

/**
 * Resolve the full expiry status for a saved card. Accepts an optional `now`
 * override so callers (tests, deterministic renders) can pin the comparison
 * instant.
 */
export function getSavedCardExpiryStatus(
  input: SavedCardExpiryInput,
  options?: { now?: Date | number; expiringSoonDays?: number }
): SavedCardExpiryStatus {
  const month = coerceInt(input.expiry_month);
  const year = normalizeYear(coerceInt(input.expiry_year));
  const hasExpiry = month >= 1 && month <= 12 && year >= 1;
  if (!hasExpiry) {
    return {
      hasExpiry: false,
      month: 0,
      year: 0,
      label: "",
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  const nowMs =
    options?.now instanceof Date
      ? options.now.getTime()
      : typeof options?.now === "number"
        ? options.now
        : Date.now();
  const cutoff = expiryCutoffMs(month, year);
  const isExpired = nowMs >= cutoff;
  const soonWindowDays = Math.max(1, options?.expiringSoonDays ?? DEFAULT_EXPIRING_SOON_DAYS);
  const soonCutoff = cutoff - soonWindowDays * 24 * 60 * 60 * 1000;
  const isExpiringSoon = !isExpired && nowMs >= soonCutoff;

  return {
    hasExpiry: true,
    month,
    year,
    label: formatSavedCardExpiry(input),
    isExpired,
    isExpiringSoon,
  };
}

/** Convenience: pure boolean check that a card is past its expiry month. */
export function isSavedCardExpired(
  input: SavedCardExpiryInput,
  now: Date | number = Date.now()
): boolean {
  return getSavedCardExpiryStatus(input, { now }).isExpired;
}
