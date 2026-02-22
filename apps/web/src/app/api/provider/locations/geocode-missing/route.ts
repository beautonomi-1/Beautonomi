/**
 * POST /api/provider/locations/geocode-missing
 *
 * Find provider's locations that have address (line1, city, country) but null
 * latitude/longitude, geocode them via Mapbox, and update the rows.
 * Use after ensure_freelancer_location or when locations were created without coords.
 */

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { geocodeProviderLocation } from "@/lib/mapbox/geocodeProviderLocation";

export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: allWithAddress, error: fetchError } = await supabase
      .from("provider_locations")
      .select("id, latitude, longitude")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .not("address_line1", "is", null)
      .not("city", "is", null)
      .not("country", "is", null);

    const locations = (allWithAddress ?? []).filter(
      (loc: any) => loc.latitude == null || loc.longitude == null
    );

    if (fetchError) {
      throw fetchError;
    }

    let updated = 0;
    for (const loc of locations ?? []) {
      const result = await geocodeProviderLocation(supabase, loc.id);
      if (result.ok) updated += 1;
    }

    return successResponse({ updated, total: locations.length });
  } catch (error) {
    return handleApiError(error, "Failed to geocode locations");
  }
}
