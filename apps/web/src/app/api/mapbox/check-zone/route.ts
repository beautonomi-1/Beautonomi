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
 * Check if a point is within any service zones.
 *
 * Priority:
 *   1. PostGIS `check_point_in_platform_zones` RPC (authoritative — uses the computed
 *      geometry column built from postal-area inclusions/exclusions).
 *   2. Legacy per-provider `service_zones` — only consulted when no active platform_zones
 *      exist in the system (pre-two-tier deployments or providers with only legacy zones).
 *
 * Response shape (unchanged for existing callers; new optional fields added):
 *   { in_zone, zones, platform_in_zone, platform_zones }
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
    const point = validationResult.data.point;

    // ── 1. PostGIS point-in-platform-zones check (primary, authoritative) ──────────────
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
      // RPC may not exist on older deployments; fall through to legacy path
    }

    // If the platform has active platform_zones and the PostGIS check returned a result,
    // we can respond immediately without consulting legacy service_zones.
    const { count: platformZoneCount } = await supabase
      .from("platform_zones")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("status", "active");

    const hasPlatformZones = (platformZoneCount ?? 0) > 0;

    if (hasPlatformZones) {
      // Platform zones are deployed — PostGIS result is authoritative.
      // For provider-scoped checks, further verify the provider has selected the matched zone.
      let in_zone = platformZones.length > 0;
      const legacyZones: { id: string; name: string; type: string }[] = [];

      if (in_zone && validationResult.data.provider_id) {
        // Narrow: does this provider have a selection for any matched platform zone?
        const matchedZoneIds = platformZones.map((z) => z.zone_id);
        const { data: selections } = await supabase
          .from("provider_zone_selections")
          .select("id, platform_zone_id")
          .eq("provider_id", validationResult.data.provider_id)
          .eq("is_active", true)
          .in("platform_zone_id", matchedZoneIds);

        in_zone = (selections?.length ?? 0) > 0;

        // Populate legacy-style zones list for backwards-compatible callers
        for (const pz of platformZones) {
          if (selections?.some((s) => s.platform_zone_id === pz.zone_id)) {
            legacyZones.push({ id: pz.zone_id, name: pz.zone_name, type: "polygon" });
          }
        }
      } else if (in_zone) {
        for (const pz of platformZones) {
          legacyZones.push({ id: pz.zone_id, name: pz.zone_name, type: "polygon" });
        }
      }

      return NextResponse.json({
        data: {
          in_zone,
          zones: legacyZones,
          platform_in_zone: platformZones.length > 0,
          platform_zones: platformZones,
        },
        error: null,
      });
    }

    // ── 2. Legacy fallback — no platform_zones deployed yet ──────────────────────────────
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
          error: { message: "Failed to check service zones", code: "FETCH_ERROR" },
        },
        { status: 500 }
      );
    }

    if (!zones || zones.length === 0) {
      return NextResponse.json({
        data: {
          in_zone: false,
          zones: [],
          platform_in_zone: false,
          platform_zones: [],
        },
        error: null,
      });
    }

    const mapbox = await getMapboxService();
    const matchingZones: { id: string; name: string; type: string }[] = [];

    for (const zone of zones) {
      const z = zone as any;
      let coordinates: { longitude: number; latitude: number }[] | { longitude: number; latitude: number };

      if (z.zone_type === "radius") {
        if (z.center_latitude == null || z.center_longitude == null) continue;
        coordinates = { longitude: Number(z.center_longitude), latitude: Number(z.center_latitude) };
      } else if (z.zone_type === "polygon" && Array.isArray(z.polygon_coordinates)) {
        coordinates = z.polygon_coordinates.map(
          (c: number[] | { lat?: number; lng?: number; latitude?: number; longitude?: number }) => {
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
          }
        );
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

      if (mapbox.isPointInZone(point, zoneData)) {
        matchingZones.push({ id: zoneData.id, name: zoneData.name, type: zoneData.type });
      }
    }

    return NextResponse.json({
      data: {
        in_zone: matchingZones.length > 0,
        zones: matchingZones,
        platform_in_zone: false,
        platform_zones: [],
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
