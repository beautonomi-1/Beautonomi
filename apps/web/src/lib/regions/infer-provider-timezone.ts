/**
 * Infer a canonical IANA time zone from structured address / coordinates.
 * Used when `providers.timezone` is empty or invalid but country/city or GPS exist.
 */
import { find } from "geo-tz";
import { isValidIanaTimeZoneId } from "@/lib/availability/time-utils";

export type ProviderLocationForTimezone = {
  country: string | null | undefined;
  city?: string | null | undefined;
  latitude?: number | string | null | undefined;
  longitude?: number | string | null | undefined;
};

/** ISO 3166-1 alpha-2 → single canonical IANA zone (countries we treat as one zone for inference). */
export const SINGLE_ZONE_IANA_BY_ISO2: Readonly<Record<string, string>> = {
  ZA: "Africa/Johannesburg",
  BW: "Africa/Gaborone",
  LS: "Africa/Maseru",
  SZ: "Africa/Mbabane",
  NA: "Africa/Windhoek",
  ZW: "Africa/Harare",
  MZ: "Africa/Maputo",
  MW: "Africa/Blantyre",
  ZM: "Africa/Lusaka",
  AO: "Africa/Luanda",
};

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  "south africa": "ZA",
  rsa: "ZA",
  botswana: "BW",
  lesotho: "LS",
  eswatini: "SZ",
  swaziland: "SZ",
  namibia: "NA",
  zimbabwe: "ZW",
  mozambique: "MZ",
  malawi: "MW",
  zambia: "ZM",
  angola: "AO",
};

function toFiniteCoord(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Best-effort ISO2 from free-text country (ISO2 code, common English name, or trailing "(XX)").
 */
export function parseCountryToIso2(country: string | null | undefined): string | null {
  if (country == null) return null;
  const s = String(country).trim();
  if (!s) return null;
  const lower = s.toLowerCase().replace(/\s+/g, " ");
  if (COUNTRY_NAME_TO_ISO2[lower]) return COUNTRY_NAME_TO_ISO2[lower];
  if (/^[a-z]{2}$/i.test(s)) return s.toUpperCase();
  const paren = s.match(/\(([a-z]{2})\)\s*$/i);
  if (paren) return paren[1]!.toUpperCase();
  return null;
}

/**
 * Prefers GPS (geo-tz) when lat/lng are valid; otherwise maps a small single-zone country allowlist.
 * Does not guess multi-zone countries from country alone (e.g. US, AU) — use coordinates for those.
 */
export function inferProviderTimezoneFromLocation(input: ProviderLocationForTimezone): string | null {
  const lat = toFiniteCoord(input.latitude);
  const lon = toFiniteCoord(input.longitude);
  if (
    lat != null &&
    lon != null &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  ) {
    // Multiple TZIDs can apply at borders; prefer the first that validates under Intl.
    const zones = find(lat, lon);
    for (const z of zones) {
      if (isValidIanaTimeZoneId(z)) return z;
    }
  }

  const iso2 = parseCountryToIso2(input.country);
  if (!iso2) return null;
  const mapped = SINGLE_ZONE_IANA_BY_ISO2[iso2];
  if (mapped && isValidIanaTimeZoneId(mapped)) return mapped;
  return null;
}
