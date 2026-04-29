import { NextResponse } from "next/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { z } from "zod";

const reverseGeocodeSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});

/**
 * POST /api/mapbox/reverse-geocode
 *
 * Body: { longitude, latitude }. Returns single Mapbox feature (place_name, center, text, context?)
 * for client alignment (e.g. customer app AddressPicker).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = reverseGeocodeSchema.safeParse(body);

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

    try {
      const mapbox = await getMapboxService();
      const result = await mapbox.reverseGeocode({
        longitude: validationResult.data.longitude,
        latitude: validationResult.data.latitude,
      });

      return NextResponse.json({
        data: result,
        error: null,
      });
    } catch (mapboxError: any) {
      if (
        mapboxError.message?.includes("not configured") ||
        mapboxError.message?.includes("MAPBOX_ACCESS_TOKEN")
      ) {
        console.warn("Mapbox not configured, returning null for reverse geocode");
        return NextResponse.json({
          data: null,
          error: null,
        });
      }
      throw mapboxError;
    }
  } catch (error: any) {
    console.error("Error in reverse geocode:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to reverse geocode coordinates",
          code: "REVERSE_GEOCODE_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
