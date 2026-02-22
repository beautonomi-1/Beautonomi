import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { z } from "zod";

const checkAvailabilitySchema = z.object({
  provider_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  address: z.object({
    address_line1: z.string(),
    city: z.string(),
    country: z.string(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }),
});

/**
 * POST /api/bookings/at-home/check-availability
 * 
 * Check if at-home service is available at the given address
 * - Verifies address is within provider's service zones
 * - Calculates distance from provider location
 * - Checks if service supports at-home
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = checkAvailabilitySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
    const mapbox = await getMapboxService();

    // Get provider
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("id", validationResult.data.provider_id)
      .single();

    if (!provider) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Geocode address if coordinates not provided
    let latitude = validationResult.data.address.latitude;
    let longitude = validationResult.data.address.longitude;

    if (!latitude || !longitude) {
      try {
        const fullAddress = [
          validationResult.data.address.address_line1,
          validationResult.data.address.city,
          validationResult.data.address.country,
        ]
          .filter(Boolean)
          .join(", ");

        const geocodeResults = await mapbox.geocode(fullAddress, {
          country: validationResult.data.address.country,
          limit: 1,
        });

        if (geocodeResults.length > 0) {
          const result = geocodeResults[0];
          longitude = result.center[0];
          latitude = result.center[1];
        } else {
          return NextResponse.json(
            {
              data: null,
              error: {
                message: "Could not geocode address",
                code: "GEOCODE_ERROR",
              },
            },
            { status: 400 }
          );
        }
      } catch (error) {
        console.error("Geocoding error:", error);
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Failed to geocode address",
              code: "GEOCODE_ERROR",
            },
          },
          { status: 500 }
        );
      }
    }

    // Check service zones
    const { data: zones } = await supabase
      .from("service_zones")
      .select("*")
      .eq("provider_id", validationResult.data.provider_id)
      .eq("is_active", true);

    let isInZone = false;
    if (zones && zones.length > 0) {
      for (const zone of zones) {
        const zoneData = {
          id: (zone as any).id,
          name: (zone as any).name,
          type: (zone as any).type,
          coordinates: JSON.parse((zone as any).coordinates),
          radius_km: (zone as any).radius_km,
          is_active: (zone as any).is_active,
        };

        if (mapbox.isPointInZone({ latitude, longitude }, zoneData)) {
          isInZone = true;
          break;
        }
      }
    } else {
      // No zones defined = service available everywhere (or check provider location)
      isInZone = true;
    }

    // Get provider's primary location for distance calculation
    const { data: providerLocation } = await supabase
      .from("provider_locations")
      .select("latitude, longitude")
      .eq("provider_id", validationResult.data.provider_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    let distanceKm = null;
    if (providerLocation && (providerLocation as any).latitude && (providerLocation as any).longitude) {
      distanceKm = mapbox.calculateDistance(
        {
          latitude: (providerLocation as any).latitude,
          longitude: (providerLocation as any).longitude,
        },
        { latitude, longitude }
      );
    }

    // Check if service supports at-home
    let serviceSupportsAtHome = true;
    if (validationResult.data.service_id) {
      const { data: service } = await supabase
        .from("offerings")
        .select("supports_at_home, at_home_radius_km")
        .eq("id", validationResult.data.service_id)
        .single();

      if (service) {
        serviceSupportsAtHome = (service as any).supports_at_home || false;
        const maxRadius = (service as any).at_home_radius_km;

        if (serviceSupportsAtHome && maxRadius && distanceKm && distanceKm > maxRadius) {
          return NextResponse.json({
            data: {
              available: false,
              reason: "distance_exceeded",
              distance_km: distanceKm,
              max_radius_km: maxRadius,
              is_in_zone: isInZone,
            },
            error: null,
          });
        }
      }
    }

    return NextResponse.json({
      data: {
        available: isInZone && serviceSupportsAtHome,
        is_in_zone: isInZone,
        service_supports_at_home: serviceSupportsAtHome,
        distance_km: distanceKm,
        coordinates: {
          latitude,
          longitude,
        },
      },
      error: null,
    });
  } catch (error: any) {
    console.error("Error checking at-home availability:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to check availability",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
