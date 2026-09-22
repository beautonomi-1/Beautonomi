import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  resolveActiveMarketFromRequest,
  resolveVisitorCountryFromRequest,
} from "@/lib/tenant/resolve-active-market";
import { readShopMarketCountryFromRequest } from "@/lib/tenant/shop-market";
import { countryFilterIso2FromStorage } from "@beautonomi/utils";

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

export function evaluateVisitorMarketAvailabilityFromRequest(request: Request): MarketAvailability {
  const visitor = resolveVisitorCountryFromRequest(request, null);
  return evaluateMarketAvailability(visitor.countryCode);
}

function isMarketTransactionGuardEnabled(): boolean {
  const raw = (process.env.MARKET_TRANSACTION_GUARD ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export type TransactionalMarketGuardInput = {
  request: Request;
  tenantSlug?: string | null;
  tenantRegionCode?: string | null;
  /** Provider onboarding uses partner-facing copy instead of customer shop opt-in text. */
  messageContext?: "customer" | "provider";
};

/**
 * Returns a NextResponse when the transaction must be blocked; null when allowed.
 */
export function assertTransactionalMarketAllowed(
  input: TransactionalMarketGuardInput,
): NextResponse | null {
  if (!isMarketTransactionGuardEnabled()) return null;

  const { request, tenantSlug, tenantRegionCode, messageContext = "customer" } = input;
  const visitorAvailability = evaluateVisitorMarketAvailabilityFromRequest(request);

  if (visitorAvailability.status === "restricted") {
    return NextResponse.json(
      {
        error: "Access unavailable in your country due to legal or regulatory restrictions.",
        code: "COUNTRY_RESTRICTED",
      },
      { status: 451 },
    );
  }

  if (tenantSlug === "global") {
    return NextResponse.json(
      {
        error: "Please switch to an available market to continue.",
        code: "MARKET_SWITCH_REQUIRED",
      },
      { status: 403 },
    );
  }

  const region = (tenantRegionCode ?? "").trim().toUpperCase();
  const supported = getSupportedMarketCountries();
  if (region && !supported.has(region)) {
    return NextResponse.json(
      {
        error: "This storefront is not available for transactions.",
        code: "MARKET_NOT_TRANSACTIONAL",
      },
      { status: 403 },
    );
  }

  const shopOptIn = readShopMarketCountryFromRequest(request);
  const visitorAllowed = visitorAvailability.status === "allowed";
  const shopMatchesTenant =
    shopOptIn != null && (region ? shopOptIn === region : supported.has(shopOptIn));

  if (!visitorAllowed && !shopMatchesTenant) {
    const error =
      messageContext === "provider"
        ? "Provider signup is only open in live markets. Join the waitlist or choose a live country for your business address."
        : "Beautonomi is not live in your country yet. Choose Shop South Africa to book, or join the waitlist.";
    return NextResponse.json(
      {
        error,
        code: "MARKET_OPT_IN_REQUIRED",
      },
      { status: 403 },
    );
  }

  return null;
}

export async function assertTransactionalMarketAllowedForTenantId(
  request: Request,
  supabase: SupabaseClient,
  tenantId: string,
  options?: { messageContext?: "customer" | "provider" },
): Promise<NextResponse | null> {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug, region_code")
    .eq("id", tenantId)
    .maybeSingle();
  return assertTransactionalMarketAllowed({
    request,
    tenantSlug: (tenant as { slug?: string } | null)?.slug ?? null,
    tenantRegionCode: (tenant as { region_code?: string } | null)?.region_code ?? null,
    messageContext: options?.messageContext,
  });
}

/** Reject provider business addresses outside live markets. */
export function assertSupportedMarketAddressCountry(
  countryCode: string | null | undefined,
): NextResponse | null {
  if (!isMarketTransactionGuardEnabled()) return null;
  const raw = (countryCode ?? "").trim();
  const code = (countryFilterIso2FromStorage(raw) ?? raw).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return NextResponse.json(
      { error: "A valid business country is required.", code: "INVALID_ADDRESS_COUNTRY" },
      { status: 400 },
    );
  }
  if (!getSupportedMarketCountries().has(code)) {
    return NextResponse.json(
      {
        error: "Provider onboarding is only available in live markets.",
        code: "ADDRESS_COUNTRY_UNSUPPORTED",
      },
      { status: 403 },
    );
  }
  return null;
}
