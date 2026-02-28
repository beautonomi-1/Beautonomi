/**
 * Client-safe phone normalization for E.164 (Supabase Auth / DB compatible).
 * Handles leading 0 (e.g. 082... → +2782...) when country code is provided.
 */

/**
 * Normalize phone to E.164 (+XXXXXXXX).
 * - Strips spaces, dashes, parentheses.
 * - If number starts with 0 and countryCode given, removes 0 and prepends country code.
 * - Returns + followed by 8–15 digits (1-9 then 7-14 more) or undefined if invalid.
 */
export function normalizePhoneToE164(
  phone: string | null | undefined,
  countryCode?: string
): string | undefined {
  if (!phone) return undefined;
  let cleaned = phone.trim().replace(/[\s\-\(\)]/g, "");
  if (!cleaned) return undefined;
  if (cleaned.startsWith("+")) cleaned = cleaned.substring(1);
  if (cleaned.startsWith("0") && countryCode) {
    cleaned = cleaned.substring(1);
    const cc = countryCode.replace(/^\+/, "");
    cleaned = cc + cleaned;
  }
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (/^[1-9]\d{7,14}$/.test(digitsOnly)) return "+" + digitsOnly;
  return undefined;
}

/** Default country code for booking flows (South Africa). */
export const DEFAULT_PHONE_COUNTRY_CODE = "27";

/** Regional indicator for flag emoji (e.g. "ZA" -> 🇿🇦). */
export function getFlagEmoji(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return "";
  const a = iso2.toUpperCase().charCodeAt(0) - 0x41 + 0x1f1e6;
  const b = iso2.toUpperCase().charCodeAt(1) - 0x41 + 0x1f1e6;
  return String.fromCodePoint(a, b);
}

/** Common country codes for phone selector (iso2 for flag emoji). */
export const PHONE_COUNTRY_OPTIONS: { code: string; label: string; dial: string; iso2: string }[] = [
  { code: "27", label: "South Africa", dial: "+27", iso2: "ZA" },
  { code: "1", label: "US / Canada", dial: "+1", iso2: "US" },
  { code: "44", label: "United Kingdom", dial: "+44", iso2: "GB" },
  { code: "254", label: "Kenya", dial: "+254", iso2: "KE" },
  { code: "234", label: "Nigeria", dial: "+234", iso2: "NG" },
  { code: "91", label: "India", dial: "+91", iso2: "IN" },
  { code: "61", label: "Australia", dial: "+61", iso2: "AU" },
  { code: "49", label: "Germany", dial: "+49", iso2: "DE" },
  { code: "33", label: "France", dial: "+33", iso2: "FR" },
  { code: "81", label: "Japan", dial: "+81", iso2: "JP" },
];
