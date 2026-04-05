/**
 * Shared phone normalization & validation (E.164 for Supabase Auth).
 * Uses libphonenumber-js (Google libphonenumber metadata) with a regex fallback
 * when the library cannot parse legacy or oddly formatted input.
 */

import type { CountryCode } from "libphonenumber-js";
import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  isPossiblePhoneNumber,
} from "libphonenumber-js/max";

export { dialCodeForIso3166Alpha2 } from "./dial-code-for-iso";

export const DEFAULT_PHONE_COUNTRY_CODE = "27";

const CALLING_CODE_TO_REGION: Record<string, CountryCode> = {
  "27": "ZA",
  "254": "KE",
  "233": "GH",
  "234": "NG",
  "20": "EG",
  "255": "TZ",
  "256": "UG",
  "260": "ZM",
  "263": "ZW",
  "267": "BW",
  "258": "MZ",
  "264": "NA",
  "212": "MA",
  "216": "TN",
  "1": "US",
  "44": "GB",
  "91": "IN",
  "971": "AE",
  "966": "SA",
  "61": "AU",
  "49": "DE",
  "33": "FR",
  "351": "PT",
  "55": "BR",
};

/** Longest calling codes first (prefix matching for split / legacy full-string fixes). */
const E164_CALLING_CODE_PREFIXES = [
  "971", "966", "254", "234", "233", "263", "260", "258", "267", "264", "255", "256", "351", "212", "216",
  "27", "91", "81", "86", "61", "49", "44", "39", "33", "34", "48", "46", "47", "31", "7", "1", "20",
];

function stripDialFormatting(s: string): string {
  return s.replace(/[\s\-\(\)]/g, "");
}

function legacyNormalizePhoneToE164(
  phone: string | null | undefined,
  countryCode?: string
): string | undefined {
  if (!phone) return undefined;
  let cleaned = stripDialFormatting(phone.trim());
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

function legacyNormalizeFullPhoneToE164(full: string | null | undefined): string | undefined {
  if (!full) return undefined;
  const trimmed = full.trim();
  if (!trimmed) return undefined;

  const noSpace = stripDialFormatting(trimmed);
  if (/^\+\d{8,15}$/.test(noSpace)) {
    const digits = noSpace.slice(1);
    for (const cc of E164_CALLING_CODE_PREFIXES) {
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

  const match = trimmed.match(/^(\+\d{1,4})\s+(.+)$/);
  if (match) {
    const countryCode = match[1];
    const national = stripDialFormatting(match[2].trim());
    return legacyNormalizePhoneToE164(national, countryCode.replace(/^\+/, ""));
  }

  return undefined;
}

/**
 * Normalize to E.164 (+…). Prefers libphonenumber; falls back to legacy digit rules.
 */
export function normalizePhoneToE164(
  phone: string | null | undefined,
  countryCode?: string
): string | undefined {
  if (!phone?.trim()) return undefined;

  let cleaned = stripDialFormatting(phone.trim());
  if (!cleaned) return undefined;

  if (cleaned.startsWith("+")) {
    const p = parsePhoneNumberFromString(cleaned);
    if (p?.isValid()) return p.format("E.164");
    return legacyNormalizePhoneToE164(phone, undefined);
  }

  const ccDigits = countryCode?.replace(/^\+/, "").trim();
  if (ccDigits) {
    const digitsOnly = cleaned.replace(/\D/g, "");
    if (!digitsOnly) return undefined;

    const region = CALLING_CODE_TO_REGION[ccDigits];
    if (region) {
      const asNational = parsePhoneNumberFromString(digitsOnly, region);
      if (asNational?.isValid()) return asNational.format("E.164");
    }

    const nationalStripped = digitsOnly.replace(/^0+/, "") || "";
    if (nationalStripped) {
      const intl = `+${ccDigits}${nationalStripped}`;
      const p = parsePhoneNumberFromString(intl);
      if (p?.isValid()) return p.format("E.164");
    }
  }

  return legacyNormalizePhoneToE164(phone, countryCode);
}

export function normalizeFullPhoneToE164(full: string | null | undefined): string | undefined {
  if (!full?.trim()) return undefined;
  const trimmed = full.trim();
  const compact = stripDialFormatting(trimmed);

  if (compact.startsWith("+")) {
    const p = parsePhoneNumberFromString(compact);
    if (p?.isValid()) return p.format("E.164");
  }

  const spaced = legacyNormalizeFullPhoneToE164(full);
  if (spaced) {
    const p2 = parsePhoneNumberFromString(spaced);
    if (p2?.isValid()) return p2.format("E.164");
    return spaced;
  }

  return undefined;
}

export function isCompleteE164(s: string | null | undefined): boolean {
  if (!s?.trim()) return false;
  const t = stripDialFormatting(s.trim());
  if (!t.startsWith("+")) return false;
  return isValidPhoneNumber(t);
}

/**
 * Live validation while typing national digits with a selected calling code.
 * Empty input → no message. Short partials → no message. Clearly impossible → message.
 */
export function nationalDigitsValidationMessage(
  countryDialDigits: string,
  nationalRaw: string
): string {
  const nat = nationalRaw.trim();
  if (!nat) return "";

  const cc = countryDialDigits.replace(/^\+/, "");
  const digits = nat.replace(/\D/g, "");
  const national = digits.replace(/^0+/, "") || "";
  if (!national) return "";

  const intl = `+${cc}${national}`;
  if (isValidPhoneNumber(intl)) return "";
  if (national.length < 4) return "";
  if (isPossiblePhoneNumber(intl)) return "";
  if (national.length > 15) return "Too many digits";
  return "Check the number for this country";
}

/**
 * Split stored E.164 (or partial) into calling code and national digits for segmented UI.
 */
export function splitValueForPhoneInput(
  value: string | undefined,
  defaultCountryCode: string
): { countryCode: string; national: string } {
  if (!value?.trim()) {
    return { countryCode: defaultCountryCode, national: "" };
  }
  const trimmed = value.trim();
  const compact = stripDialFormatting(trimmed);

  const p = parsePhoneNumberFromString(compact);
  if (p?.isValid()) {
    return {
      countryCode: "+" + p.countryCallingCode,
      national: String(p.nationalNumber),
    };
  }

  if (/^\+\d{8,15}$/.test(compact)) {
    const digits = compact.replace(/\D/g, "");
    for (const cc of E164_CALLING_CODE_PREFIXES) {
      if (digits.startsWith(cc) && digits.length > cc.length) {
        const national = digits.slice(cc.length);
        if (national.length >= 7 && national.length <= 14) {
          return { countryCode: "+" + cc, national };
        }
      }
    }
  }

  const match = trimmed.match(/^(\+\d{1,4})\s*(.+)$/);
  if (match) {
    return { countryCode: match[1], national: match[2].trim() };
  }

  return { countryCode: defaultCountryCode, national: trimmed };
}

