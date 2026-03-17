/**
 * Phone normalization for E.164 (Supabase Auth compatible).
 * Strips spaces/dashes; removes leading 0 when country code provided.
 */
const E164_COUNTRY_CODES = [
  "254", "234", "233", "27", "91", "81", "86", "61", "49", "44", "39", "33", "34", "48", "46", "47", "31", "7", "1",
];

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
    const cc = String(countryCode).replace(/^\+/, "");
    cleaned = cc + cleaned;
  }
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (/^[1-9]\d{7,14}$/.test(digitsOnly)) return "+" + digitsOnly;
  return undefined;
}

export function normalizeFullPhoneToE164(full: string | null | undefined): string | undefined {
  if (!full) return undefined;
  const trimmed = full.trim();
  if (!trimmed) return undefined;
  const noSpace = trimmed.replace(/[\s\-\(\)]/g, "");
  if (/^\+\d{8,15}$/.test(noSpace)) {
    const digits = noSpace.slice(1);
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
  const match = trimmed.match(/^(\+\d{1,4})\s+(.+)$/);
  if (match) {
    const national = match[2].trim().replace(/[\s\-\(\)]/g, "");
    return normalizePhoneToE164(national, match[1].replace(/^\+/, ""));
  }
  return undefined;
}
