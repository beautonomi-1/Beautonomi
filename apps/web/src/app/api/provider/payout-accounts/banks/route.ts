import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { listBanks } from "@/lib/payments/paystack-complete";

/**
 * GET /api/provider/payout-accounts/banks
 *
 * List banks from Paystack for a given country (e.g. ZA, NG).
 * Used by mobile and web to show bank dropdown when adding payout accounts.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["provider_owner", "provider_staff"], request);    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country") || "ZA";
    const currency = searchParams.get("currency") || (country === "ZA" ? "ZAR" : "NGN");

    const result = await listBanks({
      country,
      currency: country === "ZA" ? "ZAR" : undefined,
      perPage: 100,
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
      country: b.country ?? country,
      currency: b.currency ?? currency,
    }));

    return successResponse({ banks, country, currency });
  } catch (error) {
    return handleApiError(error, "Failed to fetch banks");
  }
}
