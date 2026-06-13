import { countryFilterIso2FromStorage } from "./countryFilterIso2";

export type VerificationCountryOption = {
  code: string;
  name: string;
};

/** Fallback when `iso_countries` is empty or the public API is unreachable. */
export const STATIC_VERIFICATION_COUNTRIES: VerificationCountryOption[] = [
  { code: "ZA", name: "South Africa" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "PT", name: "Portugal" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "IE", name: "Ireland" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "GR", name: "Greece" },
  { code: "TR", name: "Türkiye" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IN", name: "India" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" },
  { code: "VN", name: "Vietnam" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "KE", name: "Kenya" },
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "EG", name: "Egypt" },
  { code: "ET", name: "Ethiopia" },
  { code: "TZ", name: "Tanzania" },
  { code: "UG", name: "Uganda" },
  { code: "RW", name: "Rwanda" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
  { code: "BW", name: "Botswana" },
  { code: "NA", name: "Namibia" },
  { code: "MZ", name: "Mozambique" },
  { code: "MW", name: "Malawi" },
  { code: "LS", name: "Lesotho" },
  { code: "SZ", name: "Eswatini" },
  { code: "AO", name: "Angola" },
  { code: "MA", name: "Morocco" },
  { code: "TN", name: "Tunisia" },
  { code: "DZ", name: "Algeria" },
  { code: "MU", name: "Mauritius" },
  { code: "MG", name: "Madagascar" },
  { code: "SC", name: "Seychelles" },
  { code: "RU", name: "Russia" },
  { code: "UA", name: "Ukraine" },
  { code: "IL", name: "Israel" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" },
  { code: "NP", name: "Nepal" },
];

function sortByName(rows: VerificationCountryOption[]): VerificationCountryOption[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Merge API rows with the static fallback; dedupe by ISO code. */
export function mergeVerificationCountries(
  fetched: unknown[] | null | undefined,
): VerificationCountryOption[] {
  const byCode = new Map<string, VerificationCountryOption>();
  for (const row of STATIC_VERIFICATION_COUNTRIES) {
    byCode.set(row.code, row);
  }

  if (!Array.isArray(fetched)) {
    return sortByName([...byCode.values()]);
  }

  for (const raw of fetched) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const code = String(rec.code ?? "")
      .trim()
      .toUpperCase();
    const name = String(rec.name ?? "").trim();
    if (!/^[A-Z]{2}$/.test(code) || !name) continue;
    byCode.set(code, { code, name });
  }

  return sortByName([...byCode.values()]);
}

export function findVerificationCountry(
  countries: VerificationCountryOption[],
  stored: string | null | undefined,
): VerificationCountryOption | null {
  const trimmed = stored?.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  const byCode = countries.find((c) => c.code === upper);
  if (byCode) return byCode;

  const lower = trimmed.toLowerCase();
  const byName = countries.find((c) => c.name.toLowerCase() === lower);
  if (byName) return byName;

  const iso = countryFilterIso2FromStorage(trimmed);
  if (iso) {
    return countries.find((c) => c.code === iso) ?? null;
  }

  return null;
}

/** Display label for stored country (ISO code, name, or legacy free text). */
export function formatVerificationCountryDisplay(
  stored: string | null | undefined,
  countries: VerificationCountryOption[] = STATIC_VERIFICATION_COUNTRIES,
): string {
  if (!stored?.trim()) return "—";
  return findVerificationCountry(countries, stored)?.name ?? stored.trim();
}

export function resolveDefaultVerificationCountryIso(opts: {
  tenantRegionCode?: string | null;
  tenantRegionName?: string | null;
  deviceIso?: string | null;
}): string {
  const fromCode = opts.tenantRegionCode?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{2}$/.test(fromCode)) return fromCode;

  const fromName = countryFilterIso2FromStorage(opts.tenantRegionName);
  if (fromName) return fromName;

  const device = opts.deviceIso?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{2}$/.test(device)) return device;

  return "ZA";
}

export function filterVerificationCountries(
  countries: VerificationCountryOption[],
  query: string,
): VerificationCountryOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return countries;
  return countries.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
  );
}
