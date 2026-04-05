/**
 * Canonical phone country rows for PhoneInput when the API returns nothing or incomplete data.
 * ISO 3166-1 alpha-2 + ITU-T E.164 calling codes. Flags are rendered as regional-indicator emoji from `code`.
 */

export type PhoneCountryRow = {
  code: string;
  name: string;
  phone_country_code: string;
};

/** Prefer these ISO codes when several countries share a calling code (e.g. +1). */
const DIAL_PREFERRED_ISO: Record<string, string> = {
  "1": "US",
  "7": "RU",
  "27": "ZA",
  "44": "GB",
  "61": "AU",
  "212": "MA",
};

function normalizeDial(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  let s = String(raw).trim();
  if (!s.startsWith("+")) {
    const digits = s.replace(/\D/g, "");
    if (!digits) return null;
    s = "+" + digits;
  }
  return /^\+[1-9]\d{0,3}$/.test(s) ? s : null;
}

/** Merge API rows with static fallback: dedupe by ISO code, prefer API name when present. */
export function mergePhoneCountries(
  fetched: unknown[] | null | undefined,
  staticList: PhoneCountryRow[]
): PhoneCountryRow[] {
  const byIso = new Map<string, PhoneCountryRow>();
  for (const row of staticList) {
    byIso.set(row.code.toUpperCase(), { ...row, code: row.code.toUpperCase() });
  }

  if (!Array.isArray(fetched)) {
    return sortByName([...byIso.values()]);
  }

  for (const raw of fetched) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const code = String(r.code ?? "")
      .trim()
      .toUpperCase();
    const name = String(r.name ?? "").trim();
    const dial = normalizeDial(r.phone_country_code as string);
    if (!/^[A-Z]{2}$/.test(code) || !name || !dial) continue;
    byIso.set(code, { code, name, phone_country_code: dial });
  }

  return sortByName([...byIso.values()]);
}

function sortByName(rows: PhoneCountryRow[]): PhoneCountryRow[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function resolveIsoFromDial(
  dialWithPlus: string,
  countries: PhoneCountryRow[]
): string | null {
  const d = dialWithPlus.startsWith("+") ? dialWithPlus : `+${dialWithPlus.replace(/\D/g, "")}`;
  const matches = countries.filter((c) => c.phone_country_code === d);
  if (!matches.length) return null;
  const digits = d.slice(1);
  const preferred = DIAL_PREFERRED_ISO[digits];
  if (preferred) {
    const hit = matches.find((m) => m.code === preferred);
    if (hit) return hit.code;
  }
  return matches[0].code;
}

export function defaultIsoFromDial(dialWithPlus: string, staticList: PhoneCountryRow[]): string {
  const d = dialWithPlus.startsWith("+") ? dialWithPlus : `+${dialWithPlus.replace(/\D/g, "")}`;
  const digits = d.replace(/^\+/, "");
  const preferred = DIAL_PREFERRED_ISO[digits];
  if (preferred && staticList.some((c) => c.code === preferred)) return preferred;
  const row = staticList.find((c) => c.phone_country_code === d);
  return row?.code ?? "ZA";
}

/**
 * Reference list: Africa + common international destinations (E.164).
 * Extend via `iso_countries` in Supabase when populated.
 */
export const STATIC_PHONE_COUNTRIES: PhoneCountryRow[] = [
  { code: "ZA", name: "South Africa", phone_country_code: "+27" },
  { code: "US", name: "United States", phone_country_code: "+1" },
  { code: "CA", name: "Canada", phone_country_code: "+1" },
  { code: "GB", name: "United Kingdom", phone_country_code: "+44" },
  { code: "AU", name: "Australia", phone_country_code: "+61" },
  { code: "NZ", name: "New Zealand", phone_country_code: "+64" },
  { code: "DE", name: "Germany", phone_country_code: "+49" },
  { code: "FR", name: "France", phone_country_code: "+33" },
  { code: "IT", name: "Italy", phone_country_code: "+39" },
  { code: "ES", name: "Spain", phone_country_code: "+34" },
  { code: "NL", name: "Netherlands", phone_country_code: "+31" },
  { code: "BE", name: "Belgium", phone_country_code: "+32" },
  { code: "PT", name: "Portugal", phone_country_code: "+351" },
  { code: "CH", name: "Switzerland", phone_country_code: "+41" },
  { code: "AT", name: "Austria", phone_country_code: "+43" },
  { code: "SE", name: "Sweden", phone_country_code: "+46" },
  { code: "NO", name: "Norway", phone_country_code: "+47" },
  { code: "DK", name: "Denmark", phone_country_code: "+45" },
  { code: "FI", name: "Finland", phone_country_code: "+358" },
  { code: "IE", name: "Ireland", phone_country_code: "+353" },
  { code: "PL", name: "Poland", phone_country_code: "+48" },
  { code: "CZ", name: "Czech Republic", phone_country_code: "+420" },
  { code: "GR", name: "Greece", phone_country_code: "+30" },
  { code: "TR", name: "Türkiye", phone_country_code: "+90" },
  { code: "AE", name: "United Arab Emirates", phone_country_code: "+971" },
  { code: "SA", name: "Saudi Arabia", phone_country_code: "+966" },
  { code: "IN", name: "India", phone_country_code: "+91" },
  { code: "CN", name: "China", phone_country_code: "+86" },
  { code: "JP", name: "Japan", phone_country_code: "+81" },
  { code: "KR", name: "South Korea", phone_country_code: "+82" },
  { code: "SG", name: "Singapore", phone_country_code: "+65" },
  { code: "MY", name: "Malaysia", phone_country_code: "+60" },
  { code: "TH", name: "Thailand", phone_country_code: "+66" },
  { code: "PH", name: "Philippines", phone_country_code: "+63" },
  { code: "ID", name: "Indonesia", phone_country_code: "+62" },
  { code: "VN", name: "Vietnam", phone_country_code: "+84" },
  { code: "BR", name: "Brazil", phone_country_code: "+55" },
  { code: "MX", name: "Mexico", phone_country_code: "+52" },
  { code: "AR", name: "Argentina", phone_country_code: "+54" },
  { code: "KE", name: "Kenya", phone_country_code: "+254" },
  { code: "NG", name: "Nigeria", phone_country_code: "+234" },
  { code: "GH", name: "Ghana", phone_country_code: "+233" },
  { code: "EG", name: "Egypt", phone_country_code: "+20" },
  { code: "ET", name: "Ethiopia", phone_country_code: "+251" },
  { code: "TZ", name: "Tanzania", phone_country_code: "+255" },
  { code: "UG", name: "Uganda", phone_country_code: "+256" },
  { code: "RW", name: "Rwanda", phone_country_code: "+250" },
  { code: "ZM", name: "Zambia", phone_country_code: "+260" },
  { code: "ZW", name: "Zimbabwe", phone_country_code: "+263" },
  { code: "BW", name: "Botswana", phone_country_code: "+267" },
  { code: "NA", name: "Namibia", phone_country_code: "+264" },
  { code: "MZ", name: "Mozambique", phone_country_code: "+258" },
  { code: "MW", name: "Malawi", phone_country_code: "+265" },
  { code: "LS", name: "Lesotho", phone_country_code: "+266" },
  { code: "SZ", name: "Eswatini", phone_country_code: "+268" },
  { code: "AO", name: "Angola", phone_country_code: "+244" },
  { code: "CD", name: "DR Congo", phone_country_code: "+243" },
  { code: "CG", name: "Congo", phone_country_code: "+242" },
  { code: "CM", name: "Cameroon", phone_country_code: "+237" },
  { code: "CI", name: "Côte d'Ivoire", phone_country_code: "+225" },
  { code: "SN", name: "Senegal", phone_country_code: "+221" },
  { code: "MA", name: "Morocco", phone_country_code: "+212" },
  { code: "TN", name: "Tunisia", phone_country_code: "+216" },
  { code: "DZ", name: "Algeria", phone_country_code: "+213" },
  { code: "LY", name: "Libya", phone_country_code: "+218" },
  { code: "SD", name: "Sudan", phone_country_code: "+249" },
  { code: "SS", name: "South Sudan", phone_country_code: "+211" },
  { code: "SO", name: "Somalia", phone_country_code: "+252" },
  { code: "DJ", name: "Djibouti", phone_country_code: "+253" },
  { code: "ER", name: "Eritrea", phone_country_code: "+291" },
  { code: "MU", name: "Mauritius", phone_country_code: "+230" },
  { code: "RE", name: "Réunion", phone_country_code: "+262" },
  { code: "MG", name: "Madagascar", phone_country_code: "+261" },
  { code: "SC", name: "Seychelles", phone_country_code: "+248" },
  { code: "RU", name: "Russia", phone_country_code: "+7" },
  { code: "UA", name: "Ukraine", phone_country_code: "+380" },
  { code: "IL", name: "Israel", phone_country_code: "+972" },
  { code: "JO", name: "Jordan", phone_country_code: "+962" },
  { code: "LB", name: "Lebanon", phone_country_code: "+961" },
  { code: "KW", name: "Kuwait", phone_country_code: "+965" },
  { code: "QA", name: "Qatar", phone_country_code: "+974" },
  { code: "BH", name: "Bahrain", phone_country_code: "+973" },
  { code: "OM", name: "Oman", phone_country_code: "+968" },
  { code: "PK", name: "Pakistan", phone_country_code: "+92" },
  { code: "BD", name: "Bangladesh", phone_country_code: "+880" },
  { code: "LK", name: "Sri Lanka", phone_country_code: "+94" },
  { code: "NP", name: "Nepal", phone_country_code: "+977" },
];
