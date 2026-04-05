import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { listBanks } from "@/lib/payments/paystack-complete";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/** Paystack expects: south africa | nigeria | ghana | kenya (same as /api/public/banks). */
const ISO_TO_PAYSTACK_COUNTRY: Record<string, string> = {
  ZA: "south africa",
  NG: "nigeria",
  GH: "ghana",
  KE: "kenya",
};

const COUNTRY_CURRENCY: Record<string, string> = {
  ZA: LAST_RESORT_CURRENCY,
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
};

/**
 * GET /api/provider/payout-accounts/banks
 *
 * List banks from Paystack for a given country (same Paystack API as web /api/public/banks).
 * Used by mobile and web to show bank dropdown when adding payout accounts.
 * Country: ISO code (ZA, NG, GH, KE) — converted to Paystack format internally.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const fallbackIso = tenantRegion?.regionCode || "ZA";
    const { searchParams } = new URL(request.url);
    const countryParam = (searchParams.get("country") || fallbackIso).trim();
    const isoCountry =
      countryParam.length === 2
        ? countryParam.toUpperCase()
        : Object.keys(ISO_TO_PAYSTACK_COUNTRY).find(
            (k) => ISO_TO_PAYSTACK_COUNTRY[k] === countryParam.toLowerCase()
          ) ?? fallbackIso;
    const paystackCountry = ISO_TO_PAYSTACK_COUNTRY[isoCountry] ?? countryParam.toLowerCase();
    const currency =
      COUNTRY_CURRENCY[isoCountry] ?? tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const result = await listBanks({
      country: paystackCountry,
      currency,
      perPage: 100,
      tenantId,
    });

    const rawData = result.data;
    const list = Array.isArray(rawData)
      ? rawData
      : (rawData as any)?.data ?? [];
    if (!result.status) {
      return errorResponse(
        result.message || "Failed to load banks",
        "PAYSTACK_ERROR",
        400
      );
    }

    const banks = (list as any[]).map((b: any) => ({
      id: b.id,
      code: b.code ?? b.slug ?? String(b.id),
      name: b.name,
      country: isoCountry,
      currency: b.currency ?? currency,
    }));

    return successResponse({ banks, country: isoCountry, currency });
  } catch (error) {
    return handleApiError(error, "Failed to fetch banks");
  }
}
