/**
 * Shared user-facing error copy map for critical flows.
 *
 * Maps API error codes → friendly, non-technical messages shown in toasts
 * and inline error UI. Scoped to booking, payment, and auth surfaces.
 *
 * Usage:
 *   import { getUserFacingMessage } from "@/lib/errors/user-messages";
 *   toast.error(getUserFacingMessage(error.code, error.message));
 *
 * Tone guidelines:
 *  - Acknowledge what happened without blaming the user.
 *  - Tell them what to do next when possible.
 *  - Never expose internal details (SQL state, stack traces, UUIDs).
 */

// ─── Error code → user message map ────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  INVALID_CREDENTIALS: "Incorrect email or password. Please try again.",
  EMAIL_NOT_CONFIRMED: "Please check your inbox and confirm your email before signing in.",
  ACCOUNT_DEACTIVATED: "This account has been deactivated. Contact support for help.",
  SESSION_EXPIRED: "Your session has expired. Please sign in again.",
  MFA_REQUIRED: "Multi-factor authentication is required to continue.",
  MFA_INVALID_CODE: "The verification code is incorrect or has expired. Please try again.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please wait a moment and try again.",
  UNAUTHORIZED: "You need to sign in to do that.",
  FORBIDDEN: "You don't have permission to do that.",

  // ── Booking ───────────────────────────────────────────────────────────────
  BOOKING_CONFLICT:
    "That time slot is no longer available. Please choose a different time.",
  BOOKING_NOT_FOUND: "This booking could not be found.",
  BOOKING_ALREADY_CANCELLED: "This booking has already been cancelled.",
  BOOKING_CANCELLATION_WINDOW_EXPIRED:
    "The cancellation window for this booking has passed.",
  BOOKING_RESCHEDULE_UNAVAILABLE:
    "This booking can't be rescheduled right now. Please contact the provider.",
  SLOT_UNAVAILABLE:
    "This time slot is no longer available. Please pick another time.",
  PROVIDER_UNAVAILABLE:
    "The provider is not available for the selected time. Please choose a different slot.",
  OFFERING_NOT_FOUND:
    "This service is no longer available. Please go back and choose another.",
  INTAKE_FORM_REQUIRED:
    "Please complete all required fields before continuing.",
  DEPOSIT_REQUIRED:
    "A deposit is required to confirm this booking.",

  // ── Payment ───────────────────────────────────────────────────────────────
  PAYMENT_FAILED:
    "Your payment could not be processed. Please check your card details or try a different method.",
  PAYMENT_DECLINED:
    "Your card was declined. Please try a different card or payment method.",
  PAYMENT_ALREADY_PROCESSED:
    "This payment has already been processed.",
  PAYMENT_VERIFICATION_FAILED:
    "We couldn't verify your payment. If you were charged, it will appear in your bookings shortly.",
  INSUFFICIENT_WALLET_BALANCE:
    "Your wallet balance is too low for this payment.",
  INVALID_GIFT_CARD:
    "This gift card code is invalid or has already been used.",
  GIFT_CARD_EXPIRED:
    "This gift card has expired.",
  GIFT_CARD_INSUFFICIENT_BALANCE:
    "Your gift card balance doesn't cover the full amount.",
  CARD_VERIFICATION_FAILED:
    "Card verification failed. Please check your card details and try again.",
  CHECKOUT_SESSION_EXPIRED:
    "Your checkout session has expired. Please start again.",
  PAYSTACK_ERROR:
    "There was a problem with the payment gateway. Please try again in a moment.",

  // ── Network / server ──────────────────────────────────────────────────────
  NETWORK_ERROR:
    "We couldn't reach our servers. Please check your connection and try again.",
  INTERNAL_SERVER_ERROR:
    "Something went wrong on our end. Please try again in a moment.",
  SERVICE_UNAVAILABLE:
    "This feature is temporarily unavailable. Please try again shortly.",
  DIDIT_SESSION_CREATE_FAILED:
    "Online verification is temporarily unavailable. Please try again later or contact support.",
  VALIDATION_ERROR:
    "Some of the information you provided is invalid. Please review and try again.",

  // ── Money (same sentences as the provider and customer apps) ──────────────
  INVALID_STATUS: "This request is not allowed in its current status.",
  INVALID_AMOUNT: "Enter a valid amount and try again.",
  INSUFFICIENT_BALANCE: "There is not enough balance for this request.",
  PAYOUT_HELD: "Payouts are temporarily on hold. Contact support if you need help.",
  OVER_REFUND: "Refund exceeds the amount collected.",
  LEDGER_POSTING_FAILED: "The payment could not be recorded. Please retry.",
  PERIOD_LOCKED: "This financial period is locked.",
  IDEMPOTENCY_KEY_CONFLICT: "This request was already processed.",
};

/** When the API body is already a safe sentence, keep it. Raw SQL uses the map. */
const PREFER_API_MESSAGE = new Set([
  "INVALID_STATUS",
  "INVALID_AMOUNT",
  "INSUFFICIENT_BALANCE",
  "PAYOUT_HELD",
  "OVER_REFUND",
  "LEDGER_POSTING_FAILED",
  "PERIOD_LOCKED",
  "IDEMPOTENCY_KEY_CONFLICT",
]);

// ─── Public helpers ────────────────────────────────────────────────────────────

/**
 * Return a user-facing message for an error code, falling back to the raw
 * server message, then to a generic fallback string.
 *
 * @param code    - API error `code` field (e.g. "PAYMENT_DECLINED")
 * @param fallback - Raw error message from the API (shown when code is unknown)
 * @param genericFallback - Last-resort text when neither code nor fallback is useful
 */
export function getUserFacingMessage(
  code: string | null | undefined,
  fallback?: string | null,
  genericFallback = "Something went wrong. Please try again.",
): string {
  const safeFallback =
    fallback && fallback.trim() && !looksLikeTechnical(fallback) ? fallback.trim() : null;
  if (code === "VALIDATION_ERROR") {
    return safeFallback ?? ERROR_MESSAGES.VALIDATION_ERROR;
  }
  if (code && ERROR_MESSAGES[code]) {
    if (safeFallback && PREFER_API_MESSAGE.has(code)) return safeFallback;
    return ERROR_MESSAGES[code];
  }
  if (safeFallback) return safeFallback;
  return genericFallback;
}

/**
 * Keep a normal API sentence. Replace only database or internal text, using the
 * code map when one exists.
 */
export function sanitizeStoredApiMessage(
  code: string | null | undefined,
  message: string | null | undefined,
  fallback: string,
): string {
  const raw = message?.trim() ?? "";
  if (raw && !looksLikeTechnical(raw)) return raw;
  return getUserFacingMessage(code, raw || null, fallback);
}

/**
 * Heuristically suppress raw technical error text that would confuse users.
 * Returns true when the message looks like an internal error (SQL, stack, UUIDs, etc.).
 */
function looksLikeTechnical(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("relation ") ||
    lower.includes("column ") ||
    lower.includes("violates ") ||
    lower.includes("duplicate key") ||
    lower.includes("refund amount validation failed") ||
    lower.includes("finance ledger posting failed") ||
    lower.includes("new_total_refunded") ||
    lower.includes("sqlstate") ||
    lower.includes("p0001") ||
    lower.includes("stack trace") ||
    lower.includes("exception") ||
    /error at line \d+/i.test(lower) ||
    lower.includes("enough credits") ||
    lower.includes("business.didit.me") ||
    lower.includes("didit api") ||
    lower.includes("failed to create didit") ||
    // UUID-heavy messages
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(message)
  );
}

/**
 * Extract an error code from a common API error shape.
 * Supports `{ error: { code } }`, `{ code }`, and string codes.
 */
export function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;
  if (typeof e.code === "string") return e.code;
  if (e.error && typeof e.error === "object") {
    const inner = e.error as Record<string, unknown>;
    if (typeof inner.code === "string") return inner.code;
  }
  return null;
}
