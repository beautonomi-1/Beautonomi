import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { z } from "zod";

const calculateDistanceSchema = z.object({
  provider_id: z.string().uuid(),
  address: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
});

/**
 * POST /api/bookings/at-home/calculate-distance
 * 
 * Calculate distance from provider location to customer address
 * Returns distance in km and estimated travel time
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = calculateDistanceSchema.safeParse(body);

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

    // Get provider's primary location
    const { data: providerLocation } = await supabase
      .from("provider_locations")
      .select("latitude, longitude")
      .eq("provider_id", validationResult.data.provider_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!providerLocation || !(providerLocation as any).latitude || !(providerLocation as any).longitude) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider location not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const providerCoords = {
      latitude: (providerLocation as any).latitude,
      longitude: (providerLocation as any).longitude,
    };

    const customerCoords = validationResult.data.address;

    // Calculate straight-line distance
    const distanceKm = mapbox.calculateDistance(providerCoords, customerCoords);

    // Calculate route for travel time
    let route = null;
    try {
      route = await mapbox.calculateRoute([providerCoords, customerCoords], {
        profile: "driving",
        steps: false,
        overview: "simplified",
      });
    } catch (error) {
      console.warn("Route calculation failed, using straight-line distance:", error);
    }

    return NextResponse.json({
      data: {
        distance_km: distanceKm,
        distance_m: distanceKm * 1000,
        route_distance_km: route ? route.distance / 1000 : null,
        estimated_duration_minutes: route ? Math.round(route.duration / 60) : null,
        coordinates: {
          provider: providerCoords,
          customer: customerCoords,
        },
      },
      error: null,
    });
  } catch (error: any) {
    console.error("Error calculating distance:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to calculate distance",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
