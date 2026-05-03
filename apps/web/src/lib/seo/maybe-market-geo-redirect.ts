import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  MARKET_GEO_OPT_OUT_COOKIE,
  isCountryAllowedForAutoSwitch,
  isGlobalEntryHost,
  marketAutoSwitchEnabled,
  marketGeoEdgeRedirectEnabled,
  normalizeHostLabel,
} from "./host-config";
import {
  buildMarketHostCatalog,
  hostsMatchMarket,
  resolveTransactionalHostForCountry,
} from "@/lib/tenant/market-host-catalog";

const ISO2 = /^[A-Z]{2}$/;

/**
 * Optional edge redirect from global entry (.com) → transactional ccTLD when IP geo matches a mapped market.
 * Requires `MARKET_GEO_EDGE_REDIRECT_ENABLED=true`. Prefer client banners by default.
 * Host targets come from `TENANT_HOST_COUNTRY_MAP` via `buildMarketHostCatalog()`.
 */
export function maybeMarketGeoRedirect(request: NextRequest): NextResponse | null {
  if (!marketGeoEdgeRedirectEnabled()) {
    return null;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return null;
  }

  if (!marketAutoSwitchEnabled()) {
    return null;
  }

  const host = normalizeHostLabel(request.headers.get("host"));
  if (!host || !isGlobalEntryHost(host)) {
    return null;
  }

  const country =
    request.headers.get("x-vercel-ip-country")?.trim().toUpperCase() ||
    (request as NextRequest & { geo?: { country?: string } }).geo?.country
      ?.trim()
      .toUpperCase() ||
    "";

  if (!ISO2.test(country) || country === "XX" || country === "T1") {
    return null;
  }

  if (!isCountryAllowedForAutoSwitch(country)) {
    return null;
  }

  if (request.cookies.get(MARKET_GEO_OPT_OUT_COOKIE)?.value) {
    return null;
  }

  const catalog = buildMarketHostCatalog();
  const targetHost = resolveTransactionalHostForCountry(country, catalog);
  if (!targetHost) {
    return null;
  }

  if (hostsMatchMarket(host, targetHost)) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.hostname = targetHost;
  url.protocol = "https:";
  url.pathname = pathname;
  url.search = search;
  return NextResponse.redirect(url, 307);
}
