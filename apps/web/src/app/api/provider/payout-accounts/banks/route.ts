import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { fetchBankDirectory } from "@/lib/payments/bank-directory";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveIsoCountry } from "@/lib/payments/bank-directory";

/**
 * GET /api/provider/payout-accounts/banks
 *
 * List banks from Paystack for a given country. Used by mobile and web to show
 * the bank dropdown when adding payout accounts.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const fallbackIso = tenantRegion?.regionCode || "ZA";
    const { searchParams } = new URL(request.url);
    const countryParam = (searchParams.get("country") || fallbackIso).trim();
    const isoCountry = resolveIsoCountry(countryParam, fallbackIso);

    const directory = await fetchBankDirectory({ tenantId, countryParam: isoCountry });
    if (directory.payout_rail === "paystack" && directory.banks.length === 0 && !directory.use_connect) {
      return errorResponse("Failed to load banks", "PAYSTACK_ERROR", 400);
    }

    return successResponse({
      banks: directory.banks,
      country: directory.country,
      currency: directory.currency,
      ...(directory.payout_rail ? { payout_rail: directory.payout_rail } : {}),
      ...(directory.use_connect ? { use_connect: true } : {}),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch banks");
  }
}
