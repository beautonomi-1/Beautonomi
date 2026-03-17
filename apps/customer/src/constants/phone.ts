/**
 * Country codes and phone helpers for customer app (profile, login, signup).
 */

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

export type CountryCodeEntry = (typeof COUNTRY_CODES)[number];

const CODES_BY_LENGTH = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

/**
 * Strip leading zeros from national digits.
 */
export function stripLeadingZero(digits: string): string {
  return digits.replace(/^0+/, "") || "";
}

/**
 * Parse a full E.164 or similar phone string into country code and national number.
 * Tries longest matching country code first.
 */
export function parsePhoneToCountryAndNational(fullPhone: string | null | undefined): {
  countryCode: string;
  national: string;
} {
  const trimmed = (fullPhone ?? "").trim();
  const raw = trimmed.replace(/\D/g, "");
  if (!raw) return { countryCode: "+27", national: "" };
  for (const c of CODES_BY_LENGTH) {
    const codeDigits = c.code.replace(/\D/g, "");
    if (raw.startsWith(codeDigits)) {
      const national = raw.slice(codeDigits.length).replace(/^0+/, "") || "";
      return { countryCode: c.code, national };
    }
  }
  return { countryCode: "+27", national: raw.replace(/^0+/, "") };
}

/**
 * Given a stored country_code (e.g. "+27") and phone (national or full), return national digits only.
 */
export function getNationalFromStored(
  storedCountryCode: string | null | undefined,
  storedPhone: string | null | undefined
): string {
  const phone = (storedPhone ?? "").trim().replace(/\D/g, "");
  if (!phone) return "";
  const code = (storedCountryCode ?? "").trim();
  if (!code) {
    const parsed = parsePhoneToCountryAndNational(storedPhone);
    return parsed.national;
  }
  const codeDigits = code.replace(/\D/g, "");
  if (phone.startsWith(codeDigits)) return phone.slice(codeDigits.length).replace(/^0+/, "") || "";
  return phone.replace(/^0+/, "") || "";
}
