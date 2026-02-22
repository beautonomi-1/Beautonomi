import { NextResponse } from "next/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { z } from "zod";

const distanceMatrixSchema = z.object({
  origins: z
    .array(
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90),
      })
    )
    .min(1, "At least one origin required")
    .max(25, "Maximum 25 origins allowed"),
  destinations: z
    .array(
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90),
      })
    )
    .min(1, "At least one destination required")
    .max(25, "Maximum 25 destinations allowed"),
  profile: z.enum(["driving", "walking", "cycling"]).optional().default("driving"),
});

/**
 * POST /api/mapbox/distance-matrix
 * 
 * Calculate distance matrix for multiple origins and destinations
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = distanceMatrixSchema.safeParse(body);

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
    const matrix = await mapbox.calculateDistanceMatrix(
      validationResult.data.origins,
      validationResult.data.destinations,
      {
        profile: validationResult.data.profile,
      }
    );

    return NextResponse.json({
      data: matrix,
      error: null,
    });
  } catch (error: any) {
    console.error("Error calculating distance matrix:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to calculate distance matrix",
          code: "DISTANCE_MATRIX_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
