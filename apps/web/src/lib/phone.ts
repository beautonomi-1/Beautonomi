/**
 * Client-safe phone normalization for E.164 (Supabase Auth / DB compatible).
 * Supabase expects E.164: + followed by digits only, no spaces; national leading 0
 * removed when combined with country code (e.g. +27 082... → +2782...).
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

/** Country codes (without +) used to parse E.164 strings; longest first to avoid wrong split. */
const E164_COUNTRY_CODES = [
  "254", "234", "233", "27", "91", "81", "86", "61", "49", "44", "39", "33", "34", "48", "46", "47", "31", "7", "1",
];

/**
 * Normalize a full phone string (with or without space, with or without leading 0) to E.164.
 * Use when you have a single string like "+27 0823456789" or "+270823456789".
 */
export function normalizeFullPhoneToE164(full: string | null | undefined): string | undefined {
  if (!full) return undefined;
  const trimmed = full.trim();
  if (!trimmed) return undefined;

  // Already E.164 (digits only after +, no space, valid length)
  const noSpace = trimmed.replace(/[\s\-\(\)]/g, "");
  if (/^\+\d{8,15}$/.test(noSpace)) {
    const digits = noSpace.slice(1);
    // If it looks like countryCode + "0" + national (e.g. 270823456789), strip the 0
    for (const cc of E164_COUNTRY_CODES) {
      if (digits.startsWith(cc + "0")) {
        const national = digits.slice(cc.length + 1);
        if (national.length >= 7 && national.length <= 14) {
          const e164 = "+" + cc + national;
          if (/^\+[1-9]\d{7,14}$/.test(e164)) return e164;
        }
      }
    }
    return noSpace;
  }

  // Has space: split into country code and national number
  const match = trimmed.match(/^(\+\d{1,4})\s+(.+)$/);
  if (match) {
    const countryCode = match[1];
    const national = match[2].trim().replace(/[\s\-\(\)]/g, "");
    return normalizePhoneToE164(national, countryCode.replace(/^\+/, ""));
  }

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
