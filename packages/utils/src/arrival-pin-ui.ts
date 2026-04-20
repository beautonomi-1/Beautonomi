/**
 * Shared copy for at-home arrival PIN (4 or 6 digits).
 * Keep API errors and all customer/provider UIs aligned.
 */

/** API + Zod when the body is not exactly 4 or 6 digits */
export const ARRIVAL_OTP_FORMAT_MESSAGE = "OTP must be 4 or 6 digits";

/** Hint under inputs, placeholders, secondary labels */
export const ARRIVAL_PIN_LENGTH_HINT = "4 or 6 digits";

/** Input placeholder (numeric PIN) */
export const ARRIVAL_PIN_PLACEHOLDER = "4 or 6 digits";

/** Customer: main card title */
export const ARRIVAL_PIN_CUSTOMER_HEADING = "Your verification code";

/** Customer: explainer under title */
export const ARRIVAL_PIN_CUSTOMER_SUBTITLE = "Give this code to your provider when they arrive.";

/**
 * Customer: when both numeric PIN and QR are active (default platform settings:
 * OTP + QR enabled). Either method completes a single verification on the booking.
 */
export const ARRIVAL_PIN_CUSTOMER_SUBTITLE_WITH_QR =
  "Give this code to your provider, or show the QR below — either one confirms arrival.";

/**
 * Customer: QR card body when the numeric PIN card is also visible (avoid duplicate instructions).
 */
export const ARRIVAL_QR_CUSTOMER_SUBTITLE_WITH_PIN =
  "Your provider can scan this QR or enter the code on their device — same confirmation as the numbers above.";

/** Provider: main card title (mirrors customer wording) */
export const ARRIVAL_PIN_PROVIDER_HEADING = "Enter the customer's verification code";

/** Provider: one line under title */
export const ARRIVAL_PIN_PROVIDER_SUBTEXT = "Same 4 or 6 digits they see on their booking.";

/** Customer self-verify fallback section */
export const ARRIVAL_PIN_FALLBACK_LABEL = "Enter the code (fallback)";

/** Customer toast when input incomplete */
export const ARRIVAL_PIN_TOAST_CUSTOMER_INCOMPLETE = "Enter the full code: 4 or 6 digits.";

/** Provider toast / alert when OTP field incomplete */
export const ARRIVAL_PIN_TOAST_PROVIDER_INCOMPLETE = "Enter the customer's full code (4 or 6 digits).";
