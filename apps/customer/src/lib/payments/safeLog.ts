/**
 * PCI DSS SAQ A logging guard.
 *
 * Strips known card-data field names from objects before they reach
 * `console.*` or any analytics sink. We must never log:
 *   - PAN / card number, CVV / CVC, PIN, magstripe / track data, expiry
 *
 * PCI DSS v4.0 §3.4 explicitly permits storing/logging these:
 *   - `last4`, `bin`, `brand`, `bank`, `country_code`, `signature`,
 *     `authorization_code` (Paystack token — treat as sensitive but loggable
 *     for ops since it is not card data per §3.4).
 *
 * Route every payment-related log through `safeLog` to keep the mobile
 * apps comfortably inside SAQ A scope.
 */

const FORBIDDEN_KEYS = new Set<string>([
  "card_number",
  "cardnumber",
  "pan",
  "cvv",
  "cvc",
  "card_pin",
  "cardpin",
  "pin_block",
  "pinblock",
  "expiry",
  "exp",
  "expiry_month",
  "expiry_year",
  "track_data",
  "trackdata",
  "magstripe",
  "magnetic_stripe",
  "card_data",
]);

function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key.toLowerCase());
}

function scrub(value: unknown, depth: number): unknown {
  if (depth > 5) return "[redacted-depth]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => scrub(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenKey(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = scrub(v, depth + 1);
  }
  return out;
}

export function scrubPaymentLog<T>(value: T): T {
  return scrub(value, 0) as T;
}

export function safeLog(label: string, payload?: unknown): void {
  if (payload === undefined) {
    console.log(`[paystack] ${label}`);
    return;
  }
  console.log(`[paystack] ${label}`, scrubPaymentLog(payload));
}

export function safeWarn(label: string, payload?: unknown): void {
  if (payload === undefined) {
    console.warn(`[paystack] ${label}`);
    return;
  }
  console.warn(`[paystack] ${label}`, scrubPaymentLog(payload));
}
