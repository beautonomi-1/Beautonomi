import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/providers/[slug]/service-zones
 * 
 * Returns service zones for a provider (for display purposes)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug: rawSlug } = await params;
    
    // Decode slug
    let slug: string;
    try {
      slug = decodeURIComponent(rawSlug);
    } catch {
      slug = rawSlug;
    }

    // Get provider ID
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (providerError || !provider) {
      return notFoundResponse("Provider not found");
    }

    // Get platform zones that this provider has selected
    const { data: providerZoneSelections, error: zonesError } = await supabase
      .from("provider_zone_selections")
      .select(`
        id,
        travel_fee,
        travel_time_minutes,
        platform_zone:platform_zones (
          id,
          name,
          zone_type,
          description,
          cities,
          postal_codes,
          center_latitude,
          center_longitude,
          radius_km
        )
      `)
      .eq("provider_id", provider.id)
      .eq("is_active", true);

    if (zonesError) {
      throw zonesError;
    }

    // Format zones for display
    const zones = (providerZoneSelections || []).map((selection: any) => {
      const zone = selection.platform_zone;
      if (!zone) return null;

      return {
        id: zone.id,
        name: zone.name,
        type: zone.zone_type,
        description: zone.description,
        travelFee: selection.travel_fee,
        travelTimeMinutes: selection.travel_time_minutes,
        // Format coverage info for display
        coverage: zone.zone_type === "city" && zone.cities
          ? `Cities: ${zone.cities.join(", ")}`
          : zone.zone_type === "postal_code" && zone.postal_codes
          ? `${zone.postal_codes.length} postal code${zone.postal_codes.length > 1 ? "s" : ""}`
          : zone.zone_type === "radius" && zone.radius_km
          ? `Within ${zone.radius_km}km radius`
          : zone.zone_type === "polygon"
          ? "Custom area"
          : "Service area",
      };
    }).filter(Boolean);

    // Also check legacy service_zones table for backward compatibility
    const { data: legacyZones, error: legacyError } = await supabase
      .from("service_zones")
      .select("*")
      .eq("provider_id", provider.id)
      .eq("is_active", true);

    if (!legacyError && legacyZones && legacyZones.length > 0) {
      const legacyFormatted = legacyZones.map((zone: any) => ({
        id: zone.id,
        name: zone.name,
        type: zone.zone_type,
        description: null,
        travelFee: zone.travel_fee,
        travelTimeMinutes: zone.travel_time_minutes,
        coverage: zone.zone_type === "city" && zone.cities
          ? `Cities: ${zone.cities.join(", ")}`
          : zone.zone_type === "postal_code" && zone.postal_codes
          ? `${zone.postal_codes.length} postal code${zone.postal_codes.length > 1 ? "s" : ""}`
          : zone.zone_type === "radius" && zone.radius_km
          ? `Within ${zone.radius_km}km radius`
          : "Service area",
      }));

      zones.push(...legacyFormatted);
    }

    return successResponse({
      zones: zones,
      providerId: provider.id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch service zones");
  }
}
