/**
 * Country calling codes for customer mobile phone inputs.
 * National lengths are for validation after stripping a single leading trunk 0 (common in ZA, UK, etc.).
 * Supabase Auth expects E.164: +[country][national] with no leading 0 on the national part.
 */

import { isCompleteE164 } from "@beautonomi/phone";
import { normalizeSupabaseAuthPhone } from "./supabase-sms-otp";

export const COUNTRY_CODES = [
  { code: "+27", flag: "🇿🇦", label: "South Africa (+27)", phoneLen: 9 },
  { code: "+254", flag: "🇰🇪", label: "Kenya (+254)", phoneLen: 9 },
  { code: "+233", flag: "🇬🇭", label: "Ghana (+233)", phoneLen: 9 },
  { code: "+234", flag: "🇳🇬", label: "Nigeria (+234)", phoneLen: 10 },
  { code: "+20", flag: "🇪🇬", label: "Egypt (+20)", phoneLen: 10 },
  { code: "+255", flag: "🇹🇿", label: "Tanzania (+255)", phoneLen: 9 },
  { code: "+256", flag: "🇺🇬", label: "Uganda (+256)", phoneLen: 9 },
  { code: "+260", flag: "🇿🇲", label: "Zambia (+260)", phoneLen: 9 },
  { code: "+263", flag: "🇿🇼", label: "Zimbabwe (+263)", phoneLen: 9 },
  { code: "+267", flag: "🇧🇼", label: "Botswana (+267)", phoneLen: 7 },
  { code: "+258", flag: "🇲🇿", label: "Mozambique (+258)", phoneLen: 9 },
  { code: "+264", flag: "🇳🇦", label: "Namibia (+264)", phoneLen: 8 },
  { code: "+212", flag: "🇲🇦", label: "Morocco (+212)", phoneLen: 9 },
  { code: "+216", flag: "🇹🇳", label: "Tunisia (+216)", phoneLen: 8 },
  { code: "+1", flag: "🇺🇸", label: "USA (+1)", phoneLen: 10 },
  { code: "+44", flag: "🇬🇧", label: "UK (+44)", phoneLen: 10 },
  { code: "+91", flag: "🇮🇳", label: "India (+91)", phoneLen: 10 },
  { code: "+971", flag: "🇦🇪", label: "UAE (+971)", phoneLen: 9 },
  { code: "+966", flag: "🇸🇦", label: "Saudi Arabia (+966)", phoneLen: 9 },
  { code: "+61", flag: "🇦🇺", label: "Australia (+61)", phoneLen: 9 },
  { code: "+49", flag: "🇩🇪", label: "Germany (+49)", phoneLen: 11 },
  { code: "+33", flag: "🇫🇷", label: "France (+33)", phoneLen: 9 },
  { code: "+351", flag: "🇵🇹", label: "Portugal (+351)", phoneLen: 9 },
  { code: "+55", flag: "🇧🇷", label: "Brazil (+55)", phoneLen: 11 },
] as const;

export type CountryCodeOption = (typeof COUNTRY_CODES)[number];

export function stripLeadingZero(digits: string): string {
  return digits.replace(/^0+/, "");
}

export function validateNationalPhoneDigits(digits: string, countryCode: string): string | null {
  const raw = digits.replace(/\D/g, "");
  if (!raw) return null;
  const clean = stripLeadingZero(raw);
  const country = COUNTRY_CODES.find((c) => c.code === countryCode);
  const expectedLen = country?.phoneLen ?? 9;
  if (clean.length < expectedLen - 1 || clean.length > expectedLen) {
    return `Phone should be ${expectedLen} digits for ${country?.flag ?? ""} ${countryCode} (leading 0 is optional)`;
  }
  return null;
}

export function parseE164ToCountryAndNational(phone: string): { code: string; national: string } | null {
  const trimmed = phone.trim().replace(/[\s\-()]/g, "");
  if (!trimmed.startsWith("+")) return null;
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (trimmed.startsWith(c.code)) {
      return { code: c.code, national: trimmed.slice(c.code.length) };
    }
  }
  return null;
}

export function splitPhoneForNationalInput(
  stored: string | null | undefined,
  defaultCountryCode = "+27",
): { countryCode: string; nationalDisplay: string } {
  if (!stored?.trim()) return { countryCode: defaultCountryCode, nationalDisplay: "" };
  const t = stored.trim();
  const asE164 = t.startsWith("+") ? t : `+${t.replace(/\D/g, "")}`;
  const parsed = parseE164ToCountryAndNational(asE164);
  if (parsed?.national) {
    return { countryCode: parsed.code, nationalDisplay: parsed.national };
  }
  const digits = t.replace(/\D/g, "");
  return { countryCode: defaultCountryCode, nationalDisplay: digits };
}

export function composeE164FromNational(countryCode: string, nationalDigitsInput: string): string | null {
  const clean = stripLeadingZero(nationalDigitsInput.replace(/\D/g, ""));
  if (!clean) return null;
  const cc = countryCode.startsWith("+") ? countryCode : `+${countryCode}`;
  return `${cc}${clean}`;
}

export function validateE164Phone(e164: string): string | null {
  const t = (e164 ?? "").trim();
  if (!t) return null;
  let compact = normalizeSupabaseAuthPhone(t.startsWith("+") ? t : `+${t.replace(/\D/g, "")}`);
  if (!compact.startsWith("+")) {
    const digits = compact.replace(/\D/g, "");
    if (!digits) return "Enter a valid phone number with country code.";
    compact = `+${digits}`;
  }
  if (isCompleteE164(compact)) return null;
  return "Enter a valid phone number with country code.";
}
