import { resolveActiveMarketFromRequest } from "@/lib/tenant/resolve-active-market";

export type MarketAvailabilityStatus = "allowed" | "unsupported" | "restricted";

export interface MarketAvailability {
  status: MarketAvailabilityStatus;
  countryCode: string;
  reason: string | null;
}

function parseCountrySet(value: string | undefined, fallbackCsv = ""): Set<string> {
  const raw = (value ?? fallbackCsv).trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{2}$/.test(s)),
  );
}

export function getSupportedMarketCountries(): Set<string> {
  // SA-first default; add more as markets launch: e.g. ZA,UK,US
  return parseCountrySet(process.env.SUPPORTED_MARKET_COUNTRIES, "ZA");
}

export function getRestrictedCountries(): Set<string> {
  // Optional legal/compliance deny list.
  return parseCountrySet(process.env.RESTRICTED_COUNTRIES, "");
}

export function evaluateMarketAvailability(countryCode: string | null | undefined): MarketAvailability {
  const code = (countryCode ?? "").trim().toUpperCase();
  const supported = getSupportedMarketCountries();
  const restricted = getRestrictedCountries();

  if (!/^[A-Z]{2}$/.test(code)) {
    return {
      status: "unsupported",
      countryCode: "",
      reason: "Country could not be determined",
    };
  }

  if (restricted.has(code)) {
    return {
      status: "restricted",
      countryCode: code,
      reason: "Access is unavailable due to legal or regulatory restrictions",
    };
  }

  if (!supported.has(code)) {
    return {
      status: "unsupported",
      countryCode: code,
      reason: "Service is not available in this country yet",
    };
  }

  return {
    status: "allowed",
    countryCode: code,
    reason: null,
  };
}

export function evaluateMarketAvailabilityFromRequest(request: Request): MarketAvailability {
  const market = resolveActiveMarketFromRequest(request, null);
  return evaluateMarketAvailability(market.countryCode);
}
