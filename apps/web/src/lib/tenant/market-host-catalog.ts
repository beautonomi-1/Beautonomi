import {
  getConfiguredZaMarketHost,
  getGlobalEntryHostVariants,
  normalizeHostLabel,
} from "@/lib/seo/host-config";
import { getTenantHostCountryMap } from "@/lib/tenant/resolve-active-market";

const ISO2 = /^[A-Z]{2}$/;

export type MarketHostRow = {
  hostname: string;
  countryCode: string;
};

export type MarketHostCatalog = {
  /** Unique transactional hosts (apex + `www` variants), excluding global entry. */
  transactional: MarketHostRow[];
  transactionalHostnames: string[];
  globalEntryVariants: string[];
  defaultMarketHost: string;
};

function inferCountryForHostname(
  hostname: string,
  map: Record<string, string>,
  defaultMarketHost: string,
): string {
  const n = normalizeHostLabel(hostname);
  if (map[n] && ISO2.test(map[n])) return map[n];
  const apex = n.startsWith("www.") ? n.slice(4) : n;
  if (map[apex] && ISO2.test(map[apex])) return map[apex];
  const dm = normalizeHostLabel(defaultMarketHost);
  if (apex === dm || n === dm || n === `www.${dm}`) {
    const raw = process.env.DEFAULT_MARKET_COUNTRY?.trim().toUpperCase();
    if (raw && ISO2.test(raw)) return raw;
    return map[dm] || map[`www.${dm}`] || "ZA";
  }
  return map[n] || map[apex] || "";
}

/**
 * Builds the multi-market hostname catalog from `TENANT_HOST_COUNTRY_MAP` + env.
 * Add new ccTLDs to the JSON map when onboarding tenants; consumers read this via `/api/public/tenant-context`.
 */
export function buildMarketHostCatalog(): MarketHostCatalog {
  const map = getTenantHostCountryMap();
  const globalSet = new Set(getGlobalEntryHostVariants().map(normalizeHostLabel));
  const defaultMarketHost =
    normalizeHostLabel(process.env.NEXT_PUBLIC_DEFAULT_MARKET_HOST) || getConfiguredZaMarketHost();

  const candidateHosts = new Set<string>();

  for (const host of Object.keys(map)) {
    const h = normalizeHostLabel(host);
    if (!h || globalSet.has(h)) continue;
    candidateHosts.add(h);
  }

  candidateHosts.add(normalizeHostLabel(defaultMarketHost));

  const expanded = new Set<string>();
  for (const h of candidateHosts) {
    if (!h || globalSet.has(h)) continue;
    const apex = h.startsWith("www.") ? h.slice(4) : h;
    expanded.add(apex);
    expanded.add(`www.${apex}`);
  }

  for (const h of [...expanded]) {
    if (globalSet.has(h)) expanded.delete(h);
  }

  const byHostname = new Map<string, MarketHostRow>();
  for (const hostname of expanded) {
    const countryCode = inferCountryForHostname(hostname, map, defaultMarketHost);
    if (!ISO2.test(countryCode)) continue;
    byHostname.set(hostname, { hostname, countryCode });
  }

  const transactional = [...byHostname.values()].sort((a, b) => {
    const c = a.countryCode.localeCompare(b.countryCode);
    return c !== 0 ? c : a.hostname.localeCompare(b.hostname);
  });

  return {
    transactional,
    transactionalHostnames: [...expanded].filter((h) => !globalSet.has(h)).sort(),
    globalEntryVariants: [...globalSet],
    defaultMarketHost: normalizeHostLabel(defaultMarketHost),
  };
}

/** One preferred hostname per ISO country (apex preferred over `www`). Footer + geo redirect target. */
export function getDistinctMarketHostsByCountry(catalog: MarketHostCatalog): MarketHostRow[] {
  const byCountry = new Map<string, MarketHostRow>();
  for (const row of catalog.transactional) {
    const apex = row.hostname.startsWith("www.") ? row.hostname.slice(4) : row.hostname;
    const preferred =
      row.hostname.startsWith("www.") ? { hostname: apex, countryCode: row.countryCode } : row;
    if (!byCountry.has(row.countryCode)) byCountry.set(row.countryCode, preferred);
  }
  return [...byCountry.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode));
}

export function isHostnameTransactionalMarket(hostname: string, catalog: MarketHostCatalog): boolean {
  const n = normalizeHostLabel(hostname);
  return catalog.transactionalHostnames.includes(n);
}

export function resolveTransactionalHostForCountry(
  countryIso2: string,
  catalog: MarketHostCatalog,
): string | null {
  const code = countryIso2.trim().toUpperCase();
  if (!ISO2.test(code)) return null;
  const distinct = getDistinctMarketHostsByCountry(catalog);
  const row = distinct.find((r) => r.countryCode === code);
  return row?.hostname ?? null;
}

export function hostsMatchMarket(hostnameA: string, hostnameB: string): boolean {
  const a = normalizeHostLabel(hostnameA);
  const b = normalizeHostLabel(hostnameB);
  return a === b || a === `www.${b}` || b === `www.${a}`;
}
