import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkLocationFeatureAccess } from "@/lib/subscriptions/feature-access";
import { getMapboxService } from "@/lib/mapbox/mapbox";

interface Location {
  id: string;
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  postal_code?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  is_active: boolean;
  /** 'salon' = clients can visit; 'base' = distance/travel reference only (mobile-only) */
  location_type?: "salon" | "base";
}

/**
 * GET /api/provider/locations
 * 
 * Get provider's locations
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: locations, error } = await supabase
      .from("provider_locations")
      .select("*")
      .eq("provider_id", providerId)
      .order("name");

    if (error) {
      throw error;
    }

    // Map working_hours to operating_hours for frontend consistency
    const mappedLocations = (locations || []).map((loc: any) => ({
      ...loc,
      operating_hours: loc.working_hours || {},
    }));

    return successResponse(mappedLocations as Location[]);
  } catch (error) {
    return handleApiError(error, "Failed to fetch locations");
  }
}

/**
 * POST /api/provider/locations
 * 
 * Create a new location
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission to edit settings (locations are settings)
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const {
      name,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      latitude,
      longitude,
      phone,
      location_type: locationType,
    } = body;

    if (!name || !address_line1 || !city || !country) {
      return handleApiError(
        new Error("name, address_line1, city, and country are required"),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows multiple locations
    const locationAccess = await checkLocationFeatureAccess(providerId);
    if (!locationAccess.enabled) {
      return errorResponse(
        "Multiple locations require a subscription upgrade. Please upgrade your plan to add more locations.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    // Check location limit
    if (locationAccess.maxLocations) {
      const { data: existingLocations } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("provider_id", providerId)
        .eq("is_active", true);

      if ((existingLocations?.length || 0) >= locationAccess.maxLocations) {
        return errorResponse(
          `You've reached your location limit (${locationAccess.maxLocations}). Please upgrade your plan to add more locations.`,
          "LIMIT_REACHED",
          403
        );
      }
    }

    let finalLatitude = latitude ? parseFloat(latitude.toString()) : null;
    let finalLongitude = longitude ? parseFloat(longitude.toString()) : null;

    // Geocode address if coordinates not provided
    if (!finalLatitude || !finalLongitude) {
      try {
        const mapbox = await getMapboxService();
        const fullAddress = [
          address_line1,
          address_line2,
          city,
          state,
          postal_code,
          country,
        ]
          .filter(Boolean)
          .join(", ");

        const geocodeResults = await mapbox.geocode(fullAddress, {
          country: country,
          limit: 1,
        });

        if (geocodeResults.length > 0) {
          const result = geocodeResults[0];
          finalLongitude = result.center[0];
          finalLatitude = result.center[1];
        }
      } catch (error) {
        console.warn("Geocoding failed, continuing without coordinates:", error);
        // Continue without coordinates - they can be added later
      }
    }

    // Map operating_hours to working_hours for database
    const workingHours = body.operating_hours || null;

    const locationTypeValue =
      locationType === "base" || locationType === "salon" ? locationType : "salon";
    const { data: location, error } = await (supabase
      .from("provider_locations") as any)
      .insert({
        provider_id: providerId,
        name,
        address_line1,
        address_line2: address_line2 || null,
        city,
        state: state || null,
        postal_code: postal_code || null,
        country,
        latitude: finalLatitude,
        longitude: finalLongitude,
        phone: phone || null,
        working_hours: workingHours,
        is_active: true,
        location_type: locationTypeValue,
      })
      .select()
      .single();

    if (error || !location) {
      throw error || new Error("Failed to create location");
    }

    // Map working_hours to operating_hours for frontend consistency
    const mappedLocation = {
      ...location,
      operating_hours: location.working_hours || {},
    };

    // Check if this is the first location or if it's being set as primary
    const { data: existingLocations } = await supabase
      .from("provider_locations")
      .select("id, is_primary")
      .eq("provider_id", providerId)
      .neq("id", location.id);

    const isFirstLocation = (existingLocations?.length || 0) === 0;
    const isPrimary = body.is_primary || isFirstLocation; // First location is primary by default

    // If this is primary location (or first location), check for suggested zones
    if (isPrimary && finalLatitude && finalLongitude) {
      try {
        // Import the suggest endpoint logic
        const { getMapboxService: getMapbox } = await import("@/lib/mapbox/mapbox");
        const mapbox = await getMapbox();
        
        if (finalLatitude && finalLongitude) {
          const providerCoordinates = {
            latitude: finalLatitude,
            longitude: finalLongitude,
          };

          // Get all active platform zones
          const { data: platformZones } = await supabase
            .from("platform_zones")
            .select("*")
            .eq("is_active", true);

          // Get provider's existing selections
          const { data: existingSelections } = await supabase
            .from("provider_zone_selections")
            .select("platform_zone_id")
            .eq("provider_id", providerId);

          const selectedZoneIds = new Set((existingSelections || []).map((s: any) => s.platform_zone_id));
          const suggestedZones: any[] = [];

          for (const zone of platformZones || []) {
            if (selectedZoneIds.has(zone.id)) continue;

            let isMatch = false;
            let matchReason = "";

            // Check matches (same logic as suggest endpoint)
            if (zone.zone_type === "postal_code" && zone.postal_codes && postal_code) {
              const normalizedPostal = postal_code.replace(/\s/g, "");
              isMatch = zone.postal_codes.some((pc: string) => pc.replace(/\s/g, "") === normalizedPostal);
              if (isMatch) matchReason = `Your postal code (${postal_code}) is in this zone`;
            } else if (zone.zone_type === "city" && zone.cities && city) {
              const normalizedCity = city.toLowerCase().trim();
              isMatch = zone.cities.some((c: string) => c.toLowerCase().trim() === normalizedCity);
              if (isMatch) matchReason = `Your city (${city}) is in this zone`;
            } else if (zone.zone_type === "radius" && zone.center_latitude && zone.center_longitude && zone.radius_km) {
              const zoneCenter = {
                latitude: parseFloat(zone.center_latitude.toString()),
                longitude: parseFloat(zone.center_longitude.toString()),
              };
              const distance = mapbox.calculateDistance(zoneCenter, providerCoordinates);
              isMatch = distance <= zone.radius_km;
              if (isMatch) matchReason = `Your location is ${distance.toFixed(1)}km from zone center`;
            } else if (zone.zone_type === "polygon" && zone.polygon_coordinates) {
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
                if (isMatch) matchReason = "Your location is within this polygon zone";
              }
            }

            if (isMatch) {
              suggestedZones.push({
                ...zone,
                match_reason: matchReason,
              });
            }
          }

          // Store suggested zones in response metadata
          if (suggestedZones.length > 0) {
            const response = {
              ...mappedLocation,
              _metadata: {
                suggested_zones: suggestedZones,
                has_zone_suggestions: true,
              },
            };
            return successResponse(response as any);
          }
        }
      } catch (error) {
        console.warn("Failed to get zone suggestions:", error);
        // Continue without suggestions
      }
    }

    return successResponse(mappedLocation as Location);
  } catch (error) {
    return handleApiError(error, "Failed to create location");
  }
}
