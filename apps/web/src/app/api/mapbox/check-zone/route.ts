import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { z } from "zod";

const checkZoneSchema = z.object({
  point: z.object({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
  }),
  zone_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional(),
});

/**
 * POST /api/mapbox/check-zone
 * 
 * Check if a point is within any service zones
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = checkZoneSchema.safeParse(body);

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
    let query = supabase
      .from("service_zones")
      .select("*")
      .eq("is_active", true);

    if (validationResult.data.zone_id) {
      query = query.eq("id", validationResult.data.zone_id);
    }
    if (validationResult.data.provider_id) {
      query = query.eq("provider_id", validationResult.data.provider_id);
    }

    const { data: zones, error } = await query;

    if (error) {
      console.error("Error fetching service zones:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to check service zones",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    if (!zones || zones.length === 0) {
      return NextResponse.json({
        data: {
          in_zone: false,
          zones: [],
        },
        error: null,
      });
    }

    const mapbox = await getMapboxService();
    const matchingZones = [];

    for (const zone of zones) {
      const zoneData = {
        id: (zone as any).id,
        name: (zone as any).name,
        type: (zone as any).type,
        coordinates: JSON.parse((zone as any).coordinates),
        radius_km: (zone as any).radius_km,
        is_active: (zone as any).is_active,
      };

      const isInZone = mapbox.isPointInZone(validationResult.data.point, zoneData);
      if (isInZone) {
        matchingZones.push({
          id: zoneData.id,
          name: zoneData.name,
          type: zoneData.type,
        });
      }
    }

    return NextResponse.json({
      data: {
        in_zone: matchingZones.length > 0,
        zones: matchingZones,
      },
      error: null,
    });
  } catch (error: any) {
    console.error("Error checking zone:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to check service zone",
          code: "ZONE_CHECK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
