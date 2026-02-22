import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  badRequestResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const zoneSelectionSchema = z.object({
  platform_zone_id: z.string().uuid(),
  travel_fee: z.number().min(0),
  currency: z.string().length(3).default("ZAR"),
  travel_time_minutes: z.number().int().positive().default(30),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

/**
 * GET /api/provider/zone-selections
 * Get all platform zones with provider's selection status
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    // Get all active platform zones
    const { data: platformZones, error: zonesError } = await supabase
      .from("platform_zones")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (zonesError) {
      throw zonesError;
    }

    // Get provider's zone selections
    const { data: selections, error: selectionsError } = await supabase
      .from("provider_zone_selections")
      .select("*")
      .eq("provider_id", providerId);

    if (selectionsError) {
      throw selectionsError;
    }

    // Map selections by platform_zone_id for quick lookup
    const selectionsMap = new Map(
      (selections || []).map((s) => [s.platform_zone_id, s])
    );

    // Combine platform zones with provider selections
    const zonesWithSelections = (platformZones || []).map((zone) => {
      const selection = selectionsMap.get(zone.id);
      return {
        platform_zone: zone,
        selection: selection || null,
        is_selected: !!selection,
      };
    });

    return successResponse(zonesWithSelections);
  } catch (error) {
    return handleApiError(error, "Failed to fetch zone selections");
  }
}

/**
 * POST /api/provider/zone-selections
 * Select a platform zone and set provider pricing
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const body = await request.json();
    const validationResult = zoneSelectionSchema.safeParse(body);

    if (!validationResult.success) {
      return badRequestResponse(
        validationResult.error.issues.map((i) => i.message).join(", ")
      );
    }

    const data = validationResult.data;

    // Verify platform zone exists and is active
    const { data: platformZone, error: zoneError } = await supabase
      .from("platform_zones")
      .select("id, is_active")
      .eq("id", data.platform_zone_id)
      .eq("is_active", true)
      .single();

    if (zoneError || !platformZone) {
      return badRequestResponse("Platform zone not found or inactive");
    }

    // Check if already selected
    const { data: existing, error: _checkError } = await supabase
      .from("provider_zone_selections")
      .select("id")
      .eq("provider_id", providerId)
      .eq("platform_zone_id", data.platform_zone_id)
      .single();

    if (existing) {
      return badRequestResponse("Zone already selected. Use PATCH to update.");
    }

    // Create selection
    const { data: selection, error: insertError } = await supabase
      .from("provider_zone_selections")
      .insert({
        provider_id: providerId,
        platform_zone_id: data.platform_zone_id,
        travel_fee: data.travel_fee,
        currency: data.currency,
        travel_time_minutes: data.travel_time_minutes,
        description: data.description || null,
        is_active: data.is_active,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return successResponse(selection);
  } catch (error) {
    return handleApiError(error, "Failed to select zone");
  }
}
