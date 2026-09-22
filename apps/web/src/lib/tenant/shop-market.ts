import { getSupportedMarketCountries } from "@/lib/tenant/market-availability";

export const SHOP_MARKET_COOKIE = "beautonomi_shop_market";
export const SHOP_MARKET_HEADER = "x-shop-market";

const ISO2 = /^[A-Z]{2}$/;

/** First-party cookie / header proving the user chose to shop a live market (e.g. ZA). */
export function readShopMarketCountryFromRequest(request: Request): string | null {
  const header = (request.headers.get(SHOP_MARKET_HEADER) || "").trim().toUpperCase();
  if (ISO2.test(header) && getSupportedMarketCountries().has(header)) {
    return header;
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${SHOP_MARKET_COOKIE}=([^;]+)`, "i"),
  );
  const fromCookie = match?.[1] ? decodeURIComponent(match[1]).trim().toUpperCase() : "";
  if (ISO2.test(fromCookie) && getSupportedMarketCountries().has(fromCookie)) {
    return fromCookie;
  }

  return null;
}

export function shopMarketCookieMaxAgeSeconds(): number {
  const days = Number(process.env.SHOP_MARKET_COOKIE_MAX_AGE_DAYS ?? "365");
  return Math.max(1, Number.isFinite(days) ? days : 365) * 24 * 60 * 60;
}
