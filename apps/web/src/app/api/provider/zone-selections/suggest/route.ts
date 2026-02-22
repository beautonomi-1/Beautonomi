import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getMapboxService } from "@/lib/mapbox/mapbox";

/**
 * GET /api/provider/zone-selections/suggest
 * 
 * Auto-suggest platform zones based on provider's primary location
 * This makes it easier for providers to select relevant zones
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return successResponse({ suggested_zones: [], message: "Provider not found" });
    }

    // Get provider's primary location (provider_locations uses latitude/longitude per 003_providers)
    const { data: primaryLocation, error: locationError } = await supabase
      .from("provider_locations")
      .select("latitude, longitude, city, postal_code, country")
      .eq("provider_id", providerId)
      .eq("is_primary", true)
      .single();

    const plLat = (primaryLocation as any)?.latitude ?? (primaryLocation as any)?.address_lat;
    const plLng = (primaryLocation as any)?.longitude ?? (primaryLocation as any)?.address_lng;
    if (locationError || !primaryLocation || plLat == null || plLng == null) {
      return successResponse({
        suggested_zones: [],
        message: "Please set up your primary location first to get zone suggestions",
      });
    }

    const providerCoordinates = {
      latitude: plLat,
      longitude: plLng,
    };

    // Get all active platform zones
    const { data: platformZones, error: zonesError } = await supabase
      .from("platform_zones")
      .select("*")
      .eq("is_active", true);

    if (zonesError) {
      throw zonesError;
    }

    // Get provider's existing selections
    const { data: existingSelections, error: selectionsError } = await supabase
      .from("provider_zone_selections")
      .select("platform_zone_id")
      .eq("provider_id", providerId);

    if (selectionsError) {
      throw selectionsError;
    }

    const selectedZoneIds = new Set((existingSelections || []).map((s) => s.platform_zone_id));

    // Check which zones match the provider's location
    const mapbox = await getMapboxService();
    const suggestedZones: any[] = [];
    const otherZones: any[] = [];

    for (const zone of platformZones || []) {
      // Skip if already selected
      if (selectedZoneIds.has(zone.id)) {
        continue;
      }

      let isMatch = false;
      let matchReason = "";

      // Check postal code match
      if (zone.zone_type === "postal_code" && zone.postal_codes && primaryLocation.postal_code) {
        const normalizedPostal = primaryLocation.postal_code.replace(/\s/g, "");
        isMatch = zone.postal_codes.some((pc: string) => pc.replace(/\s/g, "") === normalizedPostal);
        if (isMatch) {
          matchReason = `Your postal code (${primaryLocation.postal_code}) is in this zone`;
        }
      }

      // Check city match
      if (!isMatch && zone.zone_type === "city" && zone.cities && primaryLocation.city) {
        const normalizedCity = primaryLocation.city.toLowerCase().trim();
        isMatch = zone.cities.some((c: string) => c.toLowerCase().trim() === normalizedCity);
        if (isMatch) {
          matchReason = `Your city (${primaryLocation.city}) is in this zone`;
        }
      }

      // Check radius match
      if (!isMatch && zone.zone_type === "radius" && zone.center_latitude && zone.center_longitude && zone.radius_km) {
        const zoneCenter = {
          latitude: parseFloat(zone.center_latitude.toString()),
          longitude: parseFloat(zone.center_longitude.toString()),
        };
        const distance = mapbox.calculateDistance(zoneCenter, providerCoordinates);
        isMatch = distance <= zone.radius_km;
        if (isMatch) {
          matchReason = `Your location is ${distance.toFixed(1)}km from zone center (within ${zone.radius_km}km radius)`;
        }
      }

      // Check polygon match
      if (!isMatch && zone.zone_type === "polygon" && zone.polygon_coordinates) {
        const polygon = zone.polygon_coordinates;
        if (Array.isArray(polygon) && polygon.length > 0) {
          const ring = Array.isArray(polygon[0]) ? polygon[0] : polygon;
          const polygonCoords = ring.map((coord: any) => {
            if (Array.isArray(coord)) {
              return { longitude: coord[0], latitude: coord[1] };
            }
            return { longitude: coord.lng || coord.longitude, latitude: coord.lat || coord.latitude };
          });

          // Point-in-polygon check
          let inside = false;
          for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
            const xi = polygonCoords[i].longitude;
            const yi = polygonCoords[i].latitude;
            const xj = polygonCoords[j].longitude;
            const yj = polygonCoords[j].latitude;

            const intersect =
              yi > providerCoordinates.latitude !== yj > providerCoordinates.latitude &&
              providerCoordinates.longitude < ((xj - xi) * (providerCoordinates.latitude - yi)) / (yj - yi) + xi;

            if (intersect) inside = !inside;
          }
          isMatch = inside;
          if (isMatch) {
            matchReason = "Your location is within this polygon zone";
          }
        }
      }

      const zoneWithMatch = {
        ...zone,
        match_reason: matchReason,
        is_suggested: isMatch,
      };

      if (isMatch) {
        suggestedZones.push(zoneWithMatch);
      } else {
        otherZones.push(zoneWithMatch);
      }
    }

    // Sort suggested zones by relevance (postal_code > city > radius > polygon)
    const sortPriority: Record<string, number> = {
      postal_code: 1,
      city: 2,
      radius: 3,
      polygon: 4,
    };

    suggestedZones.sort((a, b) => {
      const priorityA = sortPriority[a.zone_type] || 99;
      const priorityB = sortPriority[b.zone_type] || 99;
      return priorityA - priorityB;
    });

    return successResponse({
      suggested_zones: suggestedZones,
      other_zones: otherZones,
      provider_location: {
        city: primaryLocation.city,
        postal_code: primaryLocation.postal_code,
        coordinates: providerCoordinates,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to suggest zones");
  }
}
