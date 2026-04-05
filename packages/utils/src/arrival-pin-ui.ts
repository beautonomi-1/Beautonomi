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
