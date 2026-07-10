/**
 * Didit KYB country coverage helpers.
 *
 * When a provider's registration country is set but not in the supported set,
 * the verification plan swaps automated KYB for manual business document review.
 *
 * Source: https://docs.didit.me/business-verification/supported-countries
 * Keep this list conservative; unknown/empty country still allows automated KYB
 * (Didit will reject unsupported registries at session time).
 */

/** ISO 3166-1 alpha-2 countries where Didit KYB registry coverage is expected. */
export const DIDIT_KYB_SUPPORTED_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "GB", "UK", "NO", "CH", "IS", "LI",
  "US", "CA", "AU", "NZ", "SG", "HK", "JP", "KR",
  "ZA", "NG", "KE", "GH", "AE", "IN", "BR", "MX",
]);

export function normalizeCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== 2) return null;
  return code;
}

/**
 * Returns true when automated Didit KYB should be offered.
 * - No country declared → allow KYB (provider can still complete registry search).
 * - Country declared and in support set → allow KYB.
 * - Country declared and not supported → use manual business review instead.
 */
export function isDiditKybCountrySupported(
  registrationCountry: string | null | undefined,
): boolean {
  const code = normalizeCountryCode(registrationCountry);
  if (!code) return true;
  return DIDIT_KYB_SUPPORTED_COUNTRIES.has(code);
}
