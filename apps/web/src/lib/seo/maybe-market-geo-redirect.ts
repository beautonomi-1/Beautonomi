import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  MARKET_GEO_OPT_OUT_COOKIE,
  getConfiguredZaMarketHost,
  isCountryAllowedForAutoSwitch,
  isGlobalEntryHost,
  isZaMarketHost,
  marketAutoSwitchEnabled,
  normalizeHostLabel,
} from "./host-config";

/**
 * ZA-first: redirect global entry (.com) to default market host (.co.za) when
 * geo indicates South Africa, unless the user opted out (cookie from MarketAvailabilityGate).
 * Used from Next.js `proxy.ts` (single network boundary per Next 16+).
 */
export function maybeMarketGeoRedirect(request: NextRequest): NextResponse | null {
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
  if (country !== "ZA" || !isCountryAllowedForAutoSwitch("ZA")) {
    return null;
  }

  if (request.cookies.get(MARKET_GEO_OPT_OUT_COOKIE)?.value) {
    return null;
  }

  const targetHost = getConfiguredZaMarketHost();
  if (isZaMarketHost(host)) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.hostname = targetHost;
  url.protocol = "https:";
  url.pathname = pathname;
  url.search = search;
  return NextResponse.redirect(url, 307);
}
