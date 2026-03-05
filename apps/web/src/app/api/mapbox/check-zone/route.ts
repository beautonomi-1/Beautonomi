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
      let platformZones: { zone_id: string; zone_name: string }[] = [];
      try {
        const { data } = await supabase.rpc("check_point_in_platform_zones", {
          p_lng: validationResult.data.point.longitude,
          p_lat: validationResult.data.point.latitude,
        });
        platformZones = (data ?? []).map((r: { zone_id: string; zone_name: string }) => ({
          zone_id: r.zone_id,
          zone_name: r.zone_name,
        }));
      } catch {
        // RPC may not exist; ignore
      }
      return NextResponse.json({
        data: {
          in_zone: false,
          zones: [],
          platform_in_zone: platformZones.length > 0,
          platform_zones: platformZones,
        },
        error: null,
      });
    }

    const mapbox = await getMapboxService();
    const matchingZones = [];
    const point = validationResult.data.point;

    // Optional: check platform coverage (active platform_zones with PostGIS geometry)
    let platformZones: { zone_id: string; zone_name: string }[] = [];
    try {
      const { data } = await supabase.rpc("check_point_in_platform_zones", {
        p_lng: point.longitude,
        p_lat: point.latitude,
      });
      platformZones = (data ?? []).map((r: { zone_id: string; zone_name: string }) => ({
        zone_id: r.zone_id,
        zone_name: r.zone_name,
      }));
    } catch {
      // RPC may not exist before migration 295; ignore
    }

    for (const zone of zones) {
      const z = zone as any;
      let coordinates: { longitude: number; latitude: number }[] | { longitude: number; latitude: number };

      if (z.zone_type === "radius") {
        if (z.center_latitude == null || z.center_longitude == null) continue;
        coordinates = { longitude: Number(z.center_longitude), latitude: Number(z.center_latitude) };
      } else if (z.zone_type === "polygon" && Array.isArray(z.polygon_coordinates)) {
        coordinates = z.polygon_coordinates.map((c: number[] | { lat?: number; lng?: number; latitude?: number; longitude?: number }) => {
          if (Array.isArray(c) && c.length >= 2) {
            return { longitude: Number(c[1]), latitude: Number(c[0]) };
          }
          if (typeof c === "object" && c !== null) {
            const coord = c as { longitude?: number; latitude?: number; lng?: number; lat?: number };
            return {
              longitude: Number(coord.longitude ?? coord.lng ?? 0),
              latitude: Number(coord.latitude ?? coord.lat ?? 0),
            };
          }
          return { longitude: 0, latitude: 0 };
        });
      } else {
        continue;
      }

      const zoneData = {
        id: z.id,
        name: z.name,
        type: z.zone_type,
        coordinates,
        radius_km: z.radius_km != null ? Number(z.radius_km) : undefined,
        is_active: z.is_active,
      };

      const isInZone = mapbox.isPointInZone(point, zoneData);
      if (isInZone) {
        matchingZones.push({ id: zoneData.id, name: zoneData.name, type: zoneData.type });
      }
    }

    return NextResponse.json({
      data: {
        in_zone: matchingZones.length > 0,
        zones: matchingZones,
        platform_in_zone: platformZones.length > 0,
        platform_zones: platformZones,
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
