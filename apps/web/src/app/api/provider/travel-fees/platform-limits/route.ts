import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/travel-fees/platform-limits
 *
 * Get platform travel fee limits for provider validation (read-only).
 * Provider-scoped alternative to /api/admin/travel-fees for platform limits.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);

    const { data: platformSettings, error } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    const travelFees = platformSettings?.settings?.travel_fees || {
      provider_min_rate_per_km: 0.0,
      provider_max_rate_per_km: 50.0,
      provider_min_minimum_fee: 0.0,
      provider_max_minimum_fee: 100.0,
      allow_provider_customization: true,
    };

    return successResponse({
      default_rate_per_km: travelFees.default_rate_per_km ?? 8.0,
      default_minimum_fee: travelFees.default_minimum_fee ?? 20.0,
      default_maximum_fee: travelFees.default_maximum_fee ?? null,
      default_currency: travelFees.default_currency ?? "ZAR",
      provider_min_rate_per_km: travelFees.provider_min_rate_per_km ?? 0.0,
      provider_max_rate_per_km: travelFees.provider_max_rate_per_km ?? 50.0,
      provider_min_minimum_fee: travelFees.provider_min_minimum_fee ?? 0.0,
      provider_max_minimum_fee: travelFees.provider_max_minimum_fee ?? 100.0,
      allow_provider_customization: travelFees.allow_provider_customization !== false,
      pricing_model: travelFees.pricing_model ?? "per_km",
      default_tiers: travelFees.default_tiers ?? null,
      allow_provider_tiered: travelFees.allow_provider_tiered !== false,
      default_free_within_km:
        travelFees.default_free_within_km != null ? Number(travelFees.default_free_within_km) : 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch travel fee limits");
  }
}
