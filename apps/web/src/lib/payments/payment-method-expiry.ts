/**
 * Server-side wrappers around the shared saved-card expiry helpers in
 * `@beautonomi/utils`. Keeping a thin local module preserves the existing
 * import surface used across the web app and gives us one place to extend
 * server-only behavior (e.g. logging) without leaking it into mobile.
 */
import {
  formatSavedCardExpiry,
  getSavedCardExpiryStatus,
  isSavedCardExpired,
} from "@beautonomi/utils";

export function normalizeExpiryYear(year: number | string | null | undefined): number | null {
  const status = getSavedCardExpiryStatus({ expiry_month: 1, expiry_year: year });
  return status.hasExpiry ? status.year : null;
}

export function isPaymentMethodExpired(
  expiryMonth: number | string | null | undefined,
  expiryYear: number | string | null | undefined,
  now: Date = new Date()
): boolean {
  return isSavedCardExpired(
    { expiry_month: expiryMonth ?? null, expiry_year: expiryYear ?? null },
    now,
  );
}

export function formatPaymentMethodExpiry(
  expiryMonth: number | string | null | undefined,
  expiryYear: number | string | null | undefined
): string | null {
  const label = formatSavedCardExpiry({
    expiry_month: expiryMonth ?? null,
    expiry_year: expiryYear ?? null,
  });
  return label || null;
}
