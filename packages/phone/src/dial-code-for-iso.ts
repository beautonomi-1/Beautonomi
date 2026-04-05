/**
 * ISO 3166-1 alpha-2 → E.164 calling code.
 * Standalone module (uses default libphonenumber metadata only) so Next.js Turbopack
 * client chunks do not need to load libphonenumber-js/max from the main phone index.
 */
import type { CountryCode } from "libphonenumber-js";
import { getCountryCallingCode } from "libphonenumber-js";

/** ITU calling code for an ISO 3166-1 alpha-2 country (e.g. ZA → +27). */
export function dialCodeForIso3166Alpha2(iso: string): string | undefined {
  const c = iso?.trim().toUpperCase();
  if (!c || !/^[A-Z]{2}$/.test(c)) return undefined;
  try {
    return "+" + getCountryCallingCode(c as CountryCode);
  } catch {
    return undefined;
  }
}
