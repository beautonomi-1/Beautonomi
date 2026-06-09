import { NextResponse } from "next/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import {
  isMapboxNotConfiguredError,
  mapboxNotConfiguredGeocodeResponse,
} from "@/lib/mapbox/mapbox-config-errors";
import { z } from "zod";

const geocodeSchema = z.object({
  query: z.string().min(1, "Query is required"),
  proximity: z
    .object({
      longitude: z.number(),
      latitude: z.number(),
    })
    .optional(),
  country: z.string().optional(),
  types: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(10).optional().default(5),
});

/**
 * POST /api/mapbox/geocode
 *
 * Geocode an address to coordinates. Response shape aligned with Mapbox Geocoding API:
 * { data: Array<{ place_name, center [lng,lat], text, context? }> } for client (e.g. customer app AddressPicker).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = geocodeSchema.safeParse(body);

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
      const results = await mapbox.geocode(validationResult.data.query, {
        proximity: validationResult.data.proximity,
        country: validationResult.data.country,
        types: validationResult.data.types,
        limit: validationResult.data.limit,
      });

      return NextResponse.json({
        data: results,
        error: null,
      });
    } catch (mapboxError: unknown) {
      if (isMapboxNotConfiguredError(mapboxError)) {
        console.warn("Mapbox not configured for geocode");
        return NextResponse.json(mapboxNotConfiguredGeocodeResponse(), { status: 503 });
      }
      throw mapboxError;
    }
  } catch (error: any) {
    console.error("Error in geocode:", error);
    // Return empty results for compatibility, but expose error so callers can react.
    return NextResponse.json({
      data: [],
      error: {
        message: "Geocoding service unavailable",
        code: "GEOCODE_UNAVAILABLE",
      },
    }, { status: 502 });
  }
}
