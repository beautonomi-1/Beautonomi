/**
 * provider_locations.country is stored as a display name (e.g. "South Africa") in web + mobile.
 * Mapbox Geocoding `country` filter requires ISO 3166-1 alpha-2. Map common display names → ISO2;
 * return undefined when unknown so callers omit the filter instead of sending invalid values.
 */
const DISPLAY_TO_ISO2: Record<string, string> = {
  "south africa": "ZA",
  kenya: "KE",
  ghana: "GH",
  nigeria: "NG",
  egypt: "EG",
  "united states": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  canada: "CA",
  australia: "AU",
  "new zealand": "NZ",
  portugal: "PT",
  france: "FR",
  spain: "ES",
  germany: "DE",
  netherlands: "NL",
  belgium: "BE",
  italy: "IT",
  india: "IN",
  brazil: "BR",
  mexico: "MX",
  japan: "JP",
  china: "CN",
  "united arab emirates": "AE",
  uae: "AE",
  mozambique: "MZ",
  zimbabwe: "ZW",
  botswana: "BW",
  namibia: "NA",
  lesotho: "LS",
  eswatini: "SZ",
  swaziland: "SZ",
  tanzania: "TZ",
  uganda: "UG",
  rwanda: "RW",
};

/** If value is already 2 letters, return uppercase ISO2. */
export function countryFilterIso2FromStorage(storedCountry: string | null | undefined): string | undefined {
  if (!storedCountry?.trim()) return undefined;
  const t = storedCountry.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const iso = DISPLAY_TO_ISO2[t.toLowerCase()];
  return iso;
}
