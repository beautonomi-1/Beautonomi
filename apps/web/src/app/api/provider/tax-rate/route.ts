import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveProviderVat } from "@/lib/tax/resolve-provider-vat";

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
      return successResponse({ taxRate: 0, taxInclusive: true, isVatRegistered: false });
    }

    const { data: providerRow } = await supabase
      .from("providers")
      .select("tax_rate_percent, tax_inclusive, is_vat_registered, vat_number, country_code")
      .eq("id", providerId)
      .maybeSingle();
    const resolved = await resolveProviderVat(supabase, {
      ...(providerRow ?? {}),
      tax_rate_override_percent: null,
    });

    return successResponse({
      taxRate: resolved.registered ? resolved.ratePercent : 0,
      taxInclusive: resolved.inclusive,
      isVatRegistered: resolved.registered,
    });
  } catch (error) {
    return handleApiError(error, "Failed to get tax rate");
  }
}
