/**
 * Host / hreflang / geo-redirect cookie config (no `next/headers` — safe for Next.js proxy + client).
 */

export const MARKET_GEO_OPT_OUT_COOKIE = "beautonomi_market_geo_opt_out";

export function normalizeHostLabel(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0] ?? "";
}

export function getConfiguredZaMarketHost(): string {
  return normalizeHostLabel(process.env.NEXT_PUBLIC_DEFAULT_MARKET_HOST) || "beautonomi.co.za";
}

export function getConfiguredGlobalEntryHost(): string {
  return normalizeHostLabel(process.env.NEXT_PUBLIC_GLOBAL_ENTRY_HOST) || "beautonomi.com";
}

/** Hostnames that count as global entry (no geo redirect from these = N/A; redirect FROM these). */
export function getGlobalEntryHostVariants(): string[] {
  const h = getConfiguredGlobalEntryHost();
  if (!h) return [];
  const withWww = `www.${h}`;
  return h === withWww ? [h] : [h, withWww];
}

export function isGlobalEntryHost(host: string): boolean {
  const n = normalizeHostLabel(host);
  return getGlobalEntryHostVariants().includes(n);
}

export function getMarketOverrideCookieMaxAgeSeconds(): number {
  const hours = Number(
    process.env.NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS &&
      Number.isFinite(Number(process.env.NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS))
      ? process.env.NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS
      : "24",
  );
  return Math.max(60, Math.floor(hours * 3600));
}

/**
 * Hreflang alternates: ZA ccTLD + global .com as x-default (expand when adding regions).
 */
export function getHreflangAlternateUrls(pathname: string): Record<string, string> {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const zaHost = getConfiguredZaMarketHost();
  const globalHost = getConfiguredGlobalEntryHost();
  return {
    "en-ZA": `https://${zaHost}${path}`,
    "x-default": `https://${globalHost}${path}`,
  };
}

export function marketAutoSwitchEnabled(): boolean {
  const raw = (process.env.MARKET_AUTO_SWITCH_ENABLED ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off" && raw !== "no";
}

/** Edge 307 from global entry → ZA market when IP geo is ZA. Off by default; prefer client banners (MarketAvailabilityGate). */
export function marketGeoEdgeRedirectEnabled(): boolean {
  const raw = (process.env.MARKET_GEO_EDGE_REDIRECT_ENABLED ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

const ISO2 = /^[A-Z]{2}$/;

/** Empty env = all countries allowed (matches server market-routing). */
export function isCountryAllowedForAutoSwitch(iso2: string): boolean {
  const raw = (process.env.MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES ?? "").trim();
  if (!raw) return true;
  const set = new Set(
    raw
      .split(",")
      .map((v) => v.trim().toUpperCase())
      .filter((v) => ISO2.test(v)),
  );
  return set.has(iso2.trim().toUpperCase());
}

export function isZaMarketHost(host: string): boolean {
  const n = normalizeHostLabel(host);
  const za = getConfiguredZaMarketHost();
  return n === za || n === `www.${za}`;
}

/** Open Graph `locale` tag (e.g. en_ZA) from hostname — safe for server, proxy, and client. */
export function openGraphLocaleTagForHost(host: string): string {
  const n = normalizeHostLabel(host);
  const za = getConfiguredZaMarketHost();
  if (n === za || n === `www.${za}`) return "en_ZA";
  return "en_US";
}
