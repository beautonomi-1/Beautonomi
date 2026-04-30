import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getEffectivePlatformFeeConfig, getPlatformDefaultPlatformFeePercentage } from "@/lib/platform-service-fee-settings";

/**
 * GET /api/provider/service-fee
 * 
 * Legacy route kept for active clients. Returns the effective customer-paid
 * Platform Fee configuration; `serviceFee*` fields are deprecated aliases.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      // Return platform default if no provider
      const defaultPercentage = await getPlatformDefaultPlatformFeePercentage();
      return successResponse({ 
        platformFeePercentage: defaultPercentage,
        platformFeeFixedAmount: null,
        serviceFeePercentage: defaultPercentage,
        serviceFeeFixedAmount: null,
        feeType: "percentage",
        source: 'platform',
        legacyRoute: true,
      });
    }

    // Get subtotal from query params if provided (for min_booking_amount check)
    const searchParams = request.nextUrl.searchParams;
    const subtotal = parseFloat(searchParams.get("subtotal") || "0");

    const config = await getEffectivePlatformFeeConfig(providerId, subtotal);
    
    return successResponse({ 
      platformFeePercentage: config.percentage,
      platformFeeFixedAmount: config.fixedAmount,
      platformFeeConfigId: null,
      serviceFeePercentage: config.percentage,
      serviceFeeFixedAmount: config.fixedAmount,
      feeType: config.feeType,
      minBookingAmount: config.minBookingAmount,
      maxFeeAmount: config.maxFeeAmount,
      source: 'platform',
      legacyRoute: true,
    });
  } catch (error) {
    return handleApiError(error, "Failed to get platform fee configuration");
  }
}
