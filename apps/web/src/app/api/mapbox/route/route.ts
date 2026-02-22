import { NextResponse } from "next/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { z } from "zod";

const routeSchema = z.object({
  waypoints: z
    .array(
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90),
      })
    )
    .min(2, "At least 2 waypoints required")
    .max(25, "Maximum 25 waypoints allowed"),
  profile: z.enum(["driving", "walking", "cycling"]).optional().default("driving"),
  alternatives: z.boolean().optional().default(false),
  geometries: z.enum(["geojson", "polyline", "polyline6"]).optional().default("geojson"),
  overview: z.enum(["full", "simplified", "false"]).optional().default("full"),
  steps: z.boolean().optional().default(true),
});

/**
 * POST /api/mapbox/route
 * 
 * Calculate route between waypoints
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = routeSchema.safeParse(body);

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
    const route = await mapbox.calculateRoute(validationResult.data.waypoints, {
      profile: validationResult.data.profile,
      alternatives: validationResult.data.alternatives,
      geometries: validationResult.data.geometries,
      overview: validationResult.data.overview,
      steps: validationResult.data.steps,
    });

    return NextResponse.json({
      data: route,
      error: null,
    });
  } catch (error: any) {
    console.error("Error calculating route:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to calculate route",
          code: "ROUTE_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
