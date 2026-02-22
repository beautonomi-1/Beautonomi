import { NextResponse } from "next/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
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
 * Geocode an address to coordinates
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
    } catch (mapboxError: any) {
      // If Mapbox is not configured, return empty results instead of error
      // This allows the form to work with manual entry
      if (mapboxError.message?.includes("not configured") || 
          mapboxError.message?.includes("MAPBOX_ACCESS_TOKEN")) {
        console.warn("Mapbox not configured, returning empty results for geocode");
        return NextResponse.json({
          data: [],
          error: null,
        });
      }
      // Re-throw other errors
      throw mapboxError;
    }
  } catch (error: any) {
    console.error("Error in geocode:", error);
    // For any other error, return empty results to allow manual entry
    return NextResponse.json({
      data: [],
      error: null,
    });
  }
}
