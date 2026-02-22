import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getEffectiveTaxRate } from "@/lib/platform-tax-settings";

/**
 * GET /api/provider/tax-rate
 * 
 * Get the effective tax rate for the current provider
 * Returns: provider tax_rate_percent → platform default_tax_rate → 15% fallback
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({ taxRate: 15.00 }); // Return fallback if no provider
    }

    const taxRate = await getEffectiveTaxRate(providerId);
    
    return successResponse({ 
      taxRate,
      source: 'provider' // or 'platform' or 'fallback' - could be enhanced
    });
  } catch (error) {
    return handleApiError(error, "Failed to get tax rate");
  }
}
