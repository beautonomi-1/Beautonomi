import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getMapboxService } from "@/lib/mapbox/mapbox";

/**
 * GET /api/provider/locations/[id]
 * 
 * Get a single location by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get location
    const { data: location, error } = await supabase
      .from("provider_locations")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !location) {
      return notFoundResponse("Location not found");
    }

    // Map working_hours to operating_hours for frontend consistency
    const mappedLocation = {
      ...location,
      operating_hours: (location as any).working_hours || {},
    };

    return successResponse(mappedLocation);
  } catch (error) {
    return handleApiError(error, "Failed to fetch location");
  }
}

/**
 * PATCH /api/provider/locations/[id]
 * 
 * Update a location
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings (locations are settings)
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify location belongs to provider
    const { data: existingLocation } = await supabase
      .from("provider_locations")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingLocation) {
      return notFoundResponse("Location not found");
    }

    // Get existing location data for geocoding
    const { data: existingLocationData } = await supabase
      .from("provider_locations")
      .select("*")
      .eq("id", id)
      .single();

    // Update location
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.address_line1 !== undefined) updateData.address_line1 = body.address_line1;
    if (body.address_line2 !== undefined) updateData.address_line2 = body.address_line2;
    if (body.city !== undefined) updateData.city = body.city;
    if (body.state !== undefined) updateData.state = body.state;
    if (body.postal_code !== undefined) updateData.postal_code = body.postal_code;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.is_primary !== undefined) updateData.is_primary = body.is_primary;
    // Map operating_hours to working_hours for database
    if (body.operating_hours !== undefined) updateData.working_hours = body.operating_hours;

    // Handle coordinates
    let finalLatitude = body.latitude !== undefined ? (body.latitude ? parseFloat(body.latitude.toString()) : null) : (existingLocationData as any)?.latitude;
    let finalLongitude = body.longitude !== undefined ? (body.longitude ? parseFloat(body.longitude.toString()) : null) : (existingLocationData as any)?.longitude;

    // Re-geocode if address fields changed and coordinates not explicitly provided
    const addressChanged =
      body.address_line1 !== undefined ||
      body.city !== undefined ||
      body.country !== undefined;

    if (addressChanged && (!finalLatitude || !finalLongitude)) {
      try {
        const mapbox = await getMapboxService();
        const fullAddress = [
          body.address_line1 || (existingLocationData as any)?.address_line1,
          body.address_line2 !== undefined ? body.address_line2 : (existingLocationData as any)?.address_line2,
          body.city || (existingLocationData as any)?.city,
          body.state !== undefined ? body.state : (existingLocationData as any)?.state,
          body.postal_code !== undefined ? body.postal_code : (existingLocationData as any)?.postal_code,
          body.country || (existingLocationData as any)?.country,
        ]
          .filter(Boolean)
          .join(", ");

        const geocodeResults = await mapbox.geocode(fullAddress, {
          country: body.country || (existingLocationData as any)?.country,
          limit: 1,
        });

        if (geocodeResults.length > 0) {
          const result = geocodeResults[0];
          finalLongitude = result.center[0];
          finalLatitude = result.center[1];
        }
      } catch (error) {
        console.warn("Geocoding failed:", error);
      }
    }

    updateData.latitude = finalLatitude;
    updateData.longitude = finalLongitude;

    if (body.is_primary === true) {
      await supabase
        .from("provider_locations")
        .update({ is_primary: false } as any)
        .eq("provider_id", existingLocationData?.provider_id)
        .neq("id", id);
    }

    const { data: updatedLocation, error: updateError } = await (supabase
      .from("provider_locations") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedLocation) {
      throw updateError || new Error("Failed to update location");
    }

    // Map working_hours to operating_hours for frontend consistency
    const mappedLocation = {
      ...updatedLocation,
      operating_hours: (updatedLocation as any).working_hours || {},
    };

    // If this location is being set as primary or address changed, check for suggested zones
    const isPrimary = (updatedLocation as any).is_primary;
    
    if ((isPrimary || addressChanged) && finalLatitude && finalLongitude) {
      try {
        const { getMapboxService: getMapbox } = await import("@/lib/mapbox/mapbox");
        const mapbox = await getMapbox();
        
        const providerCoordinates = {
          latitude: finalLatitude,
          longitude: finalLongitude,
        };

        const city = body.city || (existingLocationData as any)?.city;
        const postal_code = body.postal_code !== undefined ? body.postal_code : (existingLocationData as any)?.postal_code;

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

        // Return location with suggested zones if any found
        if (suggestedZones.length > 0) {
          return successResponse({
            ...mappedLocation,
            _metadata: {
              suggested_zones: suggestedZones,
              has_zone_suggestions: true,
            },
          } as any);
        }
      } catch (error) {
        console.warn("Failed to get zone suggestions:", error);
        // Continue without suggestions
      }
    }

    return successResponse(mappedLocation);
  } catch (error) {
    return handleApiError(error, "Failed to update location");
  }
}

/**
 * DELETE /api/provider/locations/[id]
 * 
 * Delete a location
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings (locations are settings)
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify location belongs to provider
    const { data: existingLocation } = await supabase
      .from("provider_locations")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingLocation) {
      return notFoundResponse("Location not found");
    }

    // Delete location
    const { error: deleteError } = await supabase
      .from("provider_locations")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete location");
  }
}
