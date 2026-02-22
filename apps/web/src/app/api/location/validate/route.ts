import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { computeTravelFee, type TravelFeeRules } from "@/lib/travel/travelFeeEngine";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
import { z } from "zod";

const validateSchema = z.object({
  address: z.string().min(1, "Address is required"),
  provider_id: z.string().uuid().optional(),
  provider_slug: z.string().optional(),
});

/**
 * POST /api/location/validate
 * 
 * Validates an address and calculates travel fee
 * 
 * Steps:
 * 1. Geocode the address using Mapbox
 * 2. Get provider's primary location
 * 3. Get provider's travel fee and distance settings
 * 4. Calculate distance from provider to address
 * 5. Check if within service area
 * 6. Calculate travel fee based on distance/zone
 */
export async function POST(request: NextRequest) {
  try {
    const body = validateSchema.parse(await request.json());
    const supabase = await getSupabaseServer();

    // Get provider ID from provider_id or provider_slug
    let providerId: string | null = null;
    
    if (body.provider_id) {
      providerId = body.provider_id;
    } else if (body.provider_slug) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("slug", body.provider_slug)
        .eq("is_active", true)
        .single();
      
      if (!provider) {
        return errorResponse(
          "Provider not found",
          "NOT_FOUND",
          404
        );
      }
      providerId = provider.id;
    } else {
      return errorResponse(
        "provider_id or provider_slug is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Step 1: Geocode the address using Mapbox
    let geocodeResult;
    try {
      const mapbox = await getMapboxService();
      const results = await mapbox.geocode(body.address, {
        limit: 1,
        country: HOUSE_CALL_CONFIG.DEFAULT_COUNTRY_CODE,
      });

      if (!results || results.length === 0) {
        return errorResponse(
          "Could not find this address. Please enter a valid address.",
          "ADDRESS_NOT_FOUND",
          400
        );
      }

      geocodeResult = results[0];
    } catch (mapboxError: any) {
      // If Mapbox is not configured, return error
      if (mapboxError.message?.includes("not configured") || 
          mapboxError.message?.includes("MAPBOX_ACCESS_TOKEN")) {
        console.warn("Mapbox not configured, cannot validate address");
        return errorResponse(
          "Address validation is temporarily unavailable. Please contact support.",
          "SERVICE_UNAVAILABLE",
          503
        );
      }
      throw mapboxError;
    }

    const clientCoordinates = {
      latitude: geocodeResult.center[1],
      longitude: geocodeResult.center[0],
    };

    // Build service address early (needed for zone checking)
    const serviceAddress = {
      line1: geocodeResult.place_name.split(",")[0] || body.address,
      city: geocodeResult.context?.find((c: any) => c.id.startsWith("place."))?.text || "",
      country: geocodeResult.context?.find((c: any) => c.id.startsWith("country."))?.text || HOUSE_CALL_CONFIG.DEFAULT_COUNTRY_NAME,
      postalCode: geocodeResult.context?.find((c: any) => c.id.startsWith("postcode."))?.text || "",
      coordinates: clientCoordinates,
    };

    // Step 2: Get provider's settings and check if mobile services are enabled
    const { data: provider } = await supabase
      .from("providers")
      .select("max_service_distance_km, is_distance_filter_enabled, offers_mobile_services")
      .eq("id", providerId)
      .single();

    if (!provider) {
      return errorResponse(
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    // Check if provider offers mobile services
    if (provider.offers_mobile_services === false) {
      return successResponse({
        valid: false,
        travelFee: 0,
        zoneId: null,
        distanceKm: 0,
        reason: "This provider does not offer house call services. Please book at their salon location instead.",
      });
    }

    // Step 3: Get provider's locations (try primary first, then all locations)
    // provider_locations table uses latitude/longitude (see 003_providers)
    const { data: providerLocations, error: locationError } = await supabase
      .from("provider_locations")
      .select("id, latitude, longitude, address_line1, city, is_primary")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false });

    if (locationError || !providerLocations || providerLocations.length === 0) {
      return errorResponse(
        "Provider location not configured. Please contact the provider.",
        "PROVIDER_LOCATION_NOT_FOUND",
        404
      );
    }

    // Find nearest location or use primary
    const mapbox = await getMapboxService();
    let baseLocation: { latitude: number; longitude: number };
    let nearestLocation = providerLocations[0];
    let minDistance = Infinity;

    for (const loc of providerLocations) {
      const lat = (loc as any).latitude ?? (loc as any).address_lat;
      const lng = (loc as any).longitude ?? (loc as any).address_lng;
      if (lat == null || lng == null) continue;
      const dist = mapbox.calculateDistance(
        { latitude: lat, longitude: lng },
        clientCoordinates
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestLocation = loc;
      }
    }

    const nlat = (nearestLocation as any).latitude ?? (nearestLocation as any).address_lat;
    const nlng = (nearestLocation as any).longitude ?? (nearestLocation as any).address_lng;
    if (nlat == null || nlng == null) {
      return errorResponse(
        "Provider location coordinates not configured. Please contact the provider.",
        "PROVIDER_LOCATION_NOT_FOUND",
        404
      );
    }

    baseLocation = { latitude: nlat, longitude: nlng };

    // Step 4: Calculate distance
    const distanceKm = mapbox.calculateDistance(baseLocation, clientCoordinates);

    // Step 5: Check platform zones and provider zone selections
    const maxDistance = provider.max_service_distance_km || HOUSE_CALL_CONFIG.DEFAULT_MAX_SERVICE_DISTANCE_KM;
    const isDistanceFilterEnabled = provider.is_distance_filter_enabled || false;

    // First, check if address is within any active platform zone
    let matchedPlatformZone: any = null;
    let matchedZone: any = null;
    const { data: platformZones } = await supabase
      .from("platform_zones")
      .select("*")
      .eq("is_active", true);

    if (platformZones && platformZones.length > 0) {
      // Check each platform zone
      for (const zone of platformZones) {
        let isInZone = false;

        if (zone.zone_type === "postal_code" && serviceAddress.postalCode) {
          const normalizedPostal = serviceAddress.postalCode.replace(/\s/g, "");
          isInZone = zone.postal_codes?.some((pc: string) => 
            pc.replace(/\s/g, "") === normalizedPostal
          ) || false;
        } else if (zone.zone_type === "city" && serviceAddress.city) {
          const normalizedCity = serviceAddress.city.toLowerCase().trim();
          isInZone = zone.cities?.some((c: string) => 
            c.toLowerCase().trim() === normalizedCity
          ) || false;
        } else if (zone.zone_type === "radius" && zone.center_latitude && zone.center_longitude && zone.radius_km) {
          const zoneCenter = {
            latitude: parseFloat(zone.center_latitude.toString()),
            longitude: parseFloat(zone.center_longitude.toString()),
          };
          const distanceToZone = mapbox.calculateDistance(zoneCenter, clientCoordinates);
          isInZone = distanceToZone <= zone.radius_km;
        } else if (zone.zone_type === "polygon" && zone.polygon_coordinates) {
          // Use point-in-polygon check
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
                yi > clientCoordinates.latitude !== yj > clientCoordinates.latitude &&
                clientCoordinates.longitude < ((xj - xi) * (clientCoordinates.latitude - yi)) / (yj - yi) + xi;

              if (intersect) inside = !inside;
            }
            isInZone = inside;
          }
        }

        if (isInZone) {
          matchedPlatformZone = zone;
          break;
        }
      }

      // If address is not in any platform zone, it's outside platform coverage
      if (!matchedPlatformZone) {
        return successResponse({
          valid: false,
          travelFee: 0,
          zoneId: null,
          distanceKm: parseFloat(distanceKm.toFixed(2)),
          reason: `This address is ${distanceKm.toFixed(1)}km away and is outside our service coverage area. Would you like to book at the salon instead?`,
        });
      }

      // Check if provider has selected this platform zone
      const { data: providerSelection } = await supabase
        .from("provider_zone_selections")
        .select("*")
        .eq("provider_id", providerId)
        .eq("platform_zone_id", matchedPlatformZone.id)
        .eq("is_active", true)
        .single();

      if (!providerSelection) {
        return successResponse({
          valid: false,
          travelFee: 0,
          zoneId: null,
          distanceKm: parseFloat(distanceKm.toFixed(2)),
          reason: `This provider doesn't service ${serviceAddress.city || 'this area'} (${distanceKm.toFixed(1)}km away). Would you like to book at their salon location instead?`,
        });
      }

      // Use provider's pricing from selection
      matchedZone = {
        ...matchedPlatformZone,
        provider_selection: providerSelection,
      };
    } else {
      // Fallback: If no platform zones exist, check old service_zones table (for migration period)
      const { data: serviceZones } = await supabase
        .from("service_zones")
        .select("*")
        .eq("provider_id", providerId)
        .eq("is_active", true);

      if (serviceZones && serviceZones.length > 0) {
        // Use old zone checking logic (for backward compatibility during migration)
        for (const zone of serviceZones) {
          let isInZone = false;

          if (zone.zone_type === "postal_code" && serviceAddress.postalCode) {
            const normalizedPostal = serviceAddress.postalCode.replace(/\s/g, "");
            isInZone = zone.postal_codes?.some((pc: string) => 
              pc.replace(/\s/g, "") === normalizedPostal
            ) || false;
          } else if (zone.zone_type === "city" && serviceAddress.city) {
            const normalizedCity = serviceAddress.city.toLowerCase().trim();
            isInZone = zone.cities?.some((c: string) => 
              c.toLowerCase().trim() === normalizedCity
            ) || false;
          }

          if (isInZone) {
            matchedZone = zone;
            break;
          }
        }

        if (!matchedZone) {
          return successResponse({
            valid: false,
            travelFee: 0,
            zoneId: null,
            distanceKm: parseFloat(distanceKm.toFixed(2)),
            reason: `This address is ${distanceKm.toFixed(1)}km away and outside the provider's service zones. Would you like to book at their salon instead?`,
          });
        }
      }
    }

    // Check distance limit if enabled
    if (isDistanceFilterEnabled && distanceKm > maxDistance) {
      return successResponse({
        valid: false,
        travelFee: 0,
        zoneId: null,
        distanceKm: parseFloat(distanceKm.toFixed(2)),
        reason: `This address is ${distanceKm.toFixed(1)}km away, but this provider only serves areas within ${maxDistance}km. Would you like to book at their salon instead?`,
      });
    }

    // Step 6: Get provider's travel fee settings
    const { data: travelFeeSettings } = await supabase
      .from("provider_travel_fee_settings")
      .select("*")
      .eq("provider_id", providerId)
      .eq("enabled", true)
      .single();

    // Get platform defaults
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .single();

    const platformTravelFees = platformSettings?.settings?.travel_fees || {
      default_rate_per_km: HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.RATE_PER_KM,
      default_minimum_fee: HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MINIMUM_FEE,
      default_maximum_fee: HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MAXIMUM_FEE,
      default_currency: HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.CURRENCY,
    };

    // Build travel fee rules
    const usePlatformDefault = !travelFeeSettings || travelFeeSettings.use_platform_default;

    const travelFeeRules: TravelFeeRules = {
      strategy: "distance", // Use distance-based pricing
      perKmRate: usePlatformDefault 
        ? platformTravelFees.default_rate_per_km 
        : (travelFeeSettings?.rate_per_km || HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.RATE_PER_KM),
      minimumFee: usePlatformDefault
        ? platformTravelFees.default_minimum_fee
        : (travelFeeSettings?.minimum_fee || HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MINIMUM_FEE),
      maximumFee: usePlatformDefault
        ? platformTravelFees.default_maximum_fee
        : (travelFeeSettings?.maximum_fee || HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_FEE.MAXIMUM_FEE),
      maxRadiusKm: maxDistance,
      baseTravelTimeMinutes: HOUSE_CALL_CONFIG.BASE_TRAVEL_TIME_MINUTES,
      defaultMinutesPerKm: HOUSE_CALL_CONFIG.DEFAULT_MINUTES_PER_KM,
    };

    // Calculate travel fee (serviceAddress already defined above)
    const travelFeeResult = computeTravelFee(baseLocation, serviceAddress, travelFeeRules);

    if (!travelFeeResult.withinServiceArea) {
      return successResponse({
        valid: false,
        travelFee: 0,
        zoneId: null,
        distanceKm: travelFeeResult.distanceKm,
        reason: travelFeeResult.outsideReason || "Address is outside service area",
      });
    }

    // Use provider's pricing from zone selection if available
    let finalTravelFee = travelFeeResult.fee;
    let finalZoneId = matchedZone?.id || travelFeeResult.zoneName || null;
    let finalZoneName = matchedZone?.name || null;

    // If provider has selected this platform zone, use their pricing
    if (matchedZone?.provider_selection) {
      finalTravelFee = parseFloat(matchedZone.provider_selection.travel_fee.toString());
      finalZoneId = matchedZone.provider_selection.id;
      finalZoneName = matchedZone.name;
    } else if (matchedZone && matchedZone.travel_fee !== null && matchedZone.travel_fee !== undefined) {
      // Fallback to old service_zones table (during migration)
      finalTravelFee = parseFloat(matchedZone.travel_fee.toString());
    }

    return successResponse({
      valid: true,
      travelFee: Math.round(finalTravelFee * 100) / 100, // Round to 2 decimal places
      zoneId: finalZoneId,
      zoneName: finalZoneName,
      distanceKm: parseFloat((travelFeeResult.distanceKm || distanceKm).toFixed(2)),
      travelTimeMinutes: matchedZone?.provider_selection?.travel_time_minutes || matchedZone?.travel_time_minutes || travelFeeResult.travelTimeMinutes,
      coordinates: clientCoordinates,
      address: {
        line1: serviceAddress.line1,
        city: serviceAddress.city,
        country: serviceAddress.country,
        postalCode: serviceAddress.postalCode,
        fullAddress: geocodeResult.place_name,
      },
      breakdown: matchedZone?.provider_selection ? [
        { label: `${matchedZone.name} zone fee`, amount: finalTravelFee }
      ] : (matchedZone ? [
        { label: `${matchedZone.name} zone fee`, amount: finalTravelFee }
      ] : (travelFeeResult.breakdown || [
        { label: "Base travel fee", amount: travelFeeRules.minimumFee ?? 0 },
        ...(distanceKm > 0 ? [{ label: `Distance fee (${distanceKm.toFixed(1)}km)`, amount: finalTravelFee - (travelFeeRules.minimumFee ?? 0) }] : [])
      ])),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e: any) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to validate address");
  }
}
