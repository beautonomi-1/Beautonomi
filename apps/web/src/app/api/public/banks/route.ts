import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/supabase/api-helpers";
import { fetchBankDirectory } from "@/lib/payments/bank-directory";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

/**
 * GET /api/public/banks
 *
 * Bank list for admin tooling and customer bank-account flows.
 * @param country - ISO code (ZA, NG, GH, KE) or Paystack country slug
 */
export async function GET(request: NextRequest) {
  let tenantId: string;
  try {
    tenantId = await resolveTenantIdWithZaFallback(request);
  } catch (tenantErr) {
    console.error("Tenant resolution failed in /api/public/banks:", tenantErr);
    return NextResponse.json(
      {
        data: null,
        error: { message: "Tenant not configured", code: "TENANT_UNAVAILABLE" },
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const countryParam = searchParams.get("country") || undefined;

  const directory = await fetchBankDirectory({
    tenantId,
    countryParam,
    allowStaticFallback: true,
  });

  // Backward compatible: legacy clients expect `data` to be the bank array.
  return successResponse(directory.banks);
}
