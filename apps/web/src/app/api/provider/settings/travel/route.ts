import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { DEFAULT_TRAVEL_FEE_RULES } from "@/lib/travel/travelFeeEngine";

/**
 * GET /api/provider/settings/travel
 * 
 * Get provider's travel fee settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);
    
    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({
        settings: DEFAULT_TRAVEL_FEE_RULES,
        isDefault: true,
      });
    }

    // Get provider's travel settings
    const { data: provider, error } = await supabase
      .from("providers")
      .select("travel_settings")
      .eq("id", providerId)
      .single();

    if (error) {
      console.error("Error fetching travel settings:", error);
      return successResponse({
        settings: DEFAULT_TRAVEL_FEE_RULES,
        isDefault: true,
      });
    }

    // Parse travel_settings JSONB field
    const travelSettings = provider?.travel_settings as any || {};

    // Merge with defaults
    const settings = {
      strategy: travelSettings.strategy || DEFAULT_TRAVEL_FEE_RULES.strategy,
      flatFee: travelSettings.flatFee || DEFAULT_TRAVEL_FEE_RULES.flatFee,
      zones: travelSettings.zones || DEFAULT_TRAVEL_FEE_RULES.zones,
      perKmRate: travelSettings.perKmRate || DEFAULT_TRAVEL_FEE_RULES.perKmRate,
      minimumFee: travelSettings.minimumFee || DEFAULT_TRAVEL_FEE_RULES.minimumFee,
      maximumFee: travelSettings.maximumFee || DEFAULT_TRAVEL_FEE_RULES.maximumFee,
      tiers: travelSettings.tiers || DEFAULT_TRAVEL_FEE_RULES.tiers,
      maxRadiusKm: travelSettings.maxRadiusKm || DEFAULT_TRAVEL_FEE_RULES.maxRadiusKm,
      freeRadiusKm: travelSettings.freeRadiusKm || DEFAULT_TRAVEL_FEE_RULES.freeRadiusKm,
      baseTravelTimeMinutes: travelSettings.baseTravelTimeMinutes || DEFAULT_TRAVEL_FEE_RULES.baseTravelTimeMinutes,
      defaultMinutesPerKm: travelSettings.defaultMinutesPerKm || DEFAULT_TRAVEL_FEE_RULES.defaultMinutesPerKm,
    };

    return successResponse({
      settings,
      isDefault: !provider?.travel_settings,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch travel settings");
  }
}

/**
 * PUT /api/provider/settings/travel
 * 
 * Update provider's travel fee settings
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner'], request);
    const supabase = await getSupabaseServer(request);
    
    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider not found");
    }

    const body = await request.json();

    // Validate settings
    const settings = {
      strategy: body.strategy || "tiered",
      flatFee: body.flatFee,
      zones: body.zones,
      perKmRate: body.perKmRate,
      minimumFee: body.minimumFee,
      maximumFee: body.maximumFee,
      tiers: body.tiers,
      maxRadiusKm: body.maxRadiusKm,
      freeRadiusKm: body.freeRadiusKm,
      baseTravelTimeMinutes: body.baseTravelTimeMinutes,
      defaultMinutesPerKm: body.defaultMinutesPerKm,
    };

    // Update provider's travel settings
    const { error } = await supabase
      .from("providers")
      .update({ travel_settings: settings })
      .eq("id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({
      message: "Travel settings updated successfully",
      settings,
    });
  } catch (error) {
    return handleApiError(error, "Failed to update travel settings");
  }
}
