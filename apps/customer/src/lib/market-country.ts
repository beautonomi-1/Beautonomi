/**
 * Resolve the active market country for Mapbox geocoding and address forms.
 * Fallback chain: config bundle market → tenant region name/code → device region → ZA.
 */
import type { ConfigBundleMeta } from "@/lib/config-bundle";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";
import { countryFilterIso2FromStorage } from "@beautonomi/utils";

const ISO_TO_DISPLAY_NAME: Record<string, string> = {
  ZA: "South Africa",
  KE: "Kenya",
  GH: "Ghana",
  NG: "Nigeria",
  EG: "Egypt",
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
};

function normalizeIso2(value: string | null | undefined): string | undefined {
  const raw = value?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return countryFilterIso2FromStorage(value) ?? undefined;
}

/** ISO 3166-1 alpha-2 for Mapbox `country` filter and address defaults. */
export function resolveMarketCountryIso(bundle?: ConfigBundleMeta | null): string {
  const fromActiveMarket = normalizeIso2(bundle?.active_market_country);
  if (fromActiveMarket) return fromActiveMarket;

  const fromRegionCode = normalizeIso2(bundle?.tenant_region?.code);
  if (fromRegionCode) return fromRegionCode;

  const fromRegionName = countryFilterIso2FromStorage(bundle?.tenant_region?.name);
  if (fromRegionName) return fromRegionName;

  return getDeviceRegionCountryIso();
}

/** Human-readable country for structured address fields when Mapbox omits country. */
export function resolveDefaultCountryName(bundle?: ConfigBundleMeta | null): string {
  const tenantName = bundle?.tenant_region?.name?.trim();
  if (tenantName) return tenantName;

  const iso = resolveMarketCountryIso(bundle);
  return ISO_TO_DISPLAY_NAME[iso] ?? iso;
}
