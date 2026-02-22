import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getEffectiveServiceFeeConfig, getPlatformDefaultServiceFeePercentage } from "@/lib/platform-service-fee-settings";

/**
 * GET /api/provider/service-fee
 * 
 * Get the effective service fee configuration for the current provider
 * Returns: provider customer_fee_config → platform default → 10% fallback
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      // Return platform default if no provider
      const defaultPercentage = await getPlatformDefaultServiceFeePercentage();
      return successResponse({ 
        serviceFeePercentage: defaultPercentage,
        feeType: "percentage",
        source: 'platform'
      });
    }

    // Get subtotal from query params if provided (for min_booking_amount check)
    const searchParams = request.nextUrl.searchParams;
    const subtotal = parseFloat(searchParams.get("subtotal") || "0");

    const config = await getEffectiveServiceFeeConfig(providerId, subtotal);
    
    return successResponse({ 
      serviceFeePercentage: config.percentage,
      serviceFeeFixedAmount: config.fixedAmount,
      feeType: config.feeType,
      minBookingAmount: config.minBookingAmount,
      maxFeeAmount: config.maxFeeAmount,
      source: 'provider' // or 'platform' or 'fallback' - could be enhanced
    });
  } catch (error) {
    return handleApiError(error, "Failed to get service fee configuration");
  }
}
