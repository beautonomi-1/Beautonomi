/**
 * Client-safe phone helpers. Core normalization/validation: @beautonomi/phone.
 */

export {
  normalizePhoneToE164,
  normalizeFullPhoneToE164,
  isCompleteE164,
  DEFAULT_PHONE_COUNTRY_CODE,
  nationalDigitsValidationMessage,
  splitValueForPhoneInput,
} from "@beautonomi/phone";

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
