import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getMapboxService } from "@/lib/mapbox/mapbox";

/**
 * POST /api/provider/onboarding/suggest-zones
 * 
 * Suggest zones based on address during onboarding (before provider exists)
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["customer", "provider_owner", "superadmin"], request);    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { address, latitude, longitude, city, postal_code, country: _country } = body;

    if (!address || (!latitude && !longitude)) {
      return successResponse({ suggested_zones: [], message: "Address coordinates required" });
    }

    const providerCoordinates = {
      latitude: parseFloat(latitude.toString()),
      longitude: parseFloat(longitude.toString()),
    };

    // Get all active platform zones
    const { data: platformZones, error: zonesError } = await supabase
      .from("platform_zones")
      .select("*")
      .eq("is_active", true);

    if (zonesError) {
      throw zonesError;
    }

    const suggestedZones: any[] = [];
    const mapbox = await getMapboxService();

    for (const zone of platformZones || []) {
      let isMatch = false;
      let matchReason = "";

      // Check postal code match
      if (zone.zone_type === "postal_code" && zone.postal_codes && postal_code) {
        const normalizedPostal = postal_code.replace(/\s/g, "");
        isMatch = zone.postal_codes.some((pc: string) => pc.replace(/\s/g, "") === normalizedPostal);
        if (isMatch) {
          matchReason = `Your postal code (${postal_code}) is in this zone`;
        }
      }

      // Check city match
      if (!isMatch && zone.zone_type === "city" && zone.cities && city) {
        const normalizedCity = city.toLowerCase().trim();
        isMatch = zone.cities.some((c: string) => c.toLowerCase().trim() === normalizedCity);
        if (isMatch) {
          matchReason = `Your city (${city}) is in this zone`;
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

      if (isMatch) {
        suggestedZones.push({
          ...zone,
          match_reason: matchReason,
        });
      }
    }

    // Sort by relevance
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
    });
  } catch (error) {
    return handleApiError(error, "Failed to suggest zones");
  }
}
