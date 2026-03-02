/**
 * Shared validation helpers for business and location forms.
 * Returns an i18n key (e.g. "validation.required") or null if valid.
 * The UI should pass the key to t() and, for "validation.required", pass { field: fieldLabel }.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Phone: digits, +, spaces, dashes; expect at least 10 digits for a valid number. */
const PHONE_DIGITS_REGEX = /^[\d\s+\-()]+$/;
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_LENGTH = 20;

export function validateRequired(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "validation.required";
  return null;
}

export function validateEmail(value: string | null | undefined, required = true): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return required ? "validation.emailRequired" : null;
  if (!EMAIL_REGEX.test(trimmed)) return "validation.emailInvalid";
  return null;
}

export function validatePhone(value: string | null | undefined, required = false): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return required ? "validation.phoneRequired" : null;
  if (trimmed.length > MAX_PHONE_LENGTH) return "validation.phoneTooLong";
  if (!PHONE_DIGITS_REGEX.test(trimmed)) return "validation.phoneFormat";
  const digitCount = (trimmed.match(/\d/g) ?? []).length;
  if (digitCount < MIN_PHONE_DIGITS) return "validation.phoneMinDigits";
  return null;
}
