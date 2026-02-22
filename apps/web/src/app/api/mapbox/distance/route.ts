import { NextResponse } from "next/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { z } from "zod";

const distanceSchema = z.object({
  point1: z.object({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
  }),
  point2: z.object({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
  }),
});

/**
 * POST /api/mapbox/distance
 * 
 * Calculate distance between two points
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = distanceSchema.safeParse(body);

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

    const mapbox = await getMapboxService();
    const distance = mapbox.calculateDistance(
      validationResult.data.point1,
      validationResult.data.point2
    );

    return NextResponse.json({
      data: {
        distance_km: distance,
        distance_m: distance * 1000,
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
          code: "DISTANCE_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
