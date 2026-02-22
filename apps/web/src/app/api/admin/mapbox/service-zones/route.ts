import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const serviceZoneSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["radius", "polygon"]),
  coordinates: z.union([
    z.object({
      longitude: z.number(),
      latitude: z.number(),
    }),
    z.array(
      z.object({
        longitude: z.number(),
        latitude: z.number(),
      })
    ),
  ]),
  radius_km: z.number().min(0).optional(),
  is_active: z.boolean().default(true),
  provider_id: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/admin/mapbox/service-zones
 * 
 * List all service zones
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");

    let query = supabase.from("service_zones").select("*").order("name", { ascending: true });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    } else if (auth.user.role === "provider_owner") {
      // Providers can only see their own zones
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("user_id", auth.user.id)
        .single();

      if (provider) {
        query = query.eq("provider_id", (provider as any).id);
      } else {
        return NextResponse.json({
          data: [],
          error: null,
        });
      }
    }

    const { data: zones, error } = await query;

    if (error) {
      console.error("Error fetching service zones:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch service zones",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Transform database schema to match frontend expectations
    const transformedZones = (zones || []).map((zone: any) => {
      const transformed: any = {
        id: zone.id,
        name: zone.name,
        type: zone.zone_type, // zone_type -> type
        is_active: zone.is_active,
        provider_id: zone.provider_id,
        radius_km: zone.radius_km,
      };

      // Transform coordinates based on zone type
      if (zone.zone_type === "radius") {
        transformed.coordinates = {
          longitude: zone.center_longitude,
          latitude: zone.center_latitude,
        };
      } else if (zone.zone_type === "polygon") {
        // Transform polygon_coordinates from [[lat, lng], ...] to [{longitude, latitude}, ...]
        if (Array.isArray(zone.polygon_coordinates)) {
          transformed.coordinates = zone.polygon_coordinates.map((coord: any) => {
            if (Array.isArray(coord) && coord.length >= 2) {
              return {
                longitude: coord[1], // lng is second
                latitude: coord[0],  // lat is first
              };
            }
            return coord;
          });
        } else {
          transformed.coordinates = [];
        }
      }

      return transformed;
    });

    return NextResponse.json({
      data: transformedZones,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/mapbox/service-zones:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch service zones",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/mapbox/service-zones
 * 
 * Create a new service zone
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validationResult = serviceZoneSchema.safeParse(body);
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

    // Validate radius for radius type
    if (validationResult.data.type === "radius" && !validationResult.data.radius_km) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "radius_km is required for radius type zones",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Validate polygon coordinates
    if (
      validationResult.data.type === "polygon" &&
      (!Array.isArray(validationResult.data.coordinates) ||
        validationResult.data.coordinates.length < 3)
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Polygon requires at least 3 coordinates",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // If provider_owner, ensure they own the provider
    if (auth.user.role === "provider_owner" && validationResult.data.provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", validationResult.data.provider_id)
        .eq("user_id", auth.user.id)
        .single();

      if (!provider) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Provider not found or access denied",
              code: "FORBIDDEN",
            },
          },
          { status: 403 }
        );
      }
    }

    // Transform frontend schema to database schema
    const dbData: any = {
      name: validationResult.data.name,
      zone_type: validationResult.data.type, // type -> zone_type
      is_active: validationResult.data.is_active,
      provider_id: validationResult.data.provider_id,
      radius_km: validationResult.data.radius_km,
    };

    if (validationResult.data.type === "radius") {
      // For radius zones, extract coordinates
      const coords = validationResult.data.coordinates as { longitude: number; latitude: number };
      dbData.center_longitude = coords.longitude;
      dbData.center_latitude = coords.latitude;
    } else if (validationResult.data.type === "polygon") {
      // For polygon zones, transform [{longitude, latitude}, ...] to [[lat, lng], ...]
      const coords = validationResult.data.coordinates as Array<{ longitude: number; latitude: number }>;
      dbData.polygon_coordinates = coords.map((coord) => [coord.latitude, coord.longitude]);
    }

    const { data: zone, error } = await (supabase
      .from("service_zones") as any)
      .insert(dbData)
      .select()
      .single();

    if (error || !zone) {
      console.error("Error creating service zone:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create service zone",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Transform database schema back to frontend format
    const transformedZone: any = {
      id: zone.id,
      name: zone.name,
      type: zone.zone_type,
      is_active: zone.is_active,
      provider_id: zone.provider_id,
      radius_km: zone.radius_km,
    };

    if (zone.zone_type === "radius") {
      transformedZone.coordinates = {
        longitude: zone.center_longitude,
        latitude: zone.center_latitude,
      };
    } else if (zone.zone_type === "polygon") {
      if (Array.isArray(zone.polygon_coordinates)) {
        transformedZone.coordinates = zone.polygon_coordinates.map((coord: any) => {
          if (Array.isArray(coord) && coord.length >= 2) {
            return {
              longitude: coord[1],
              latitude: coord[0],
            };
          }
          return coord;
        });
      } else {
        transformedZone.coordinates = [];
      }
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: auth.user.role,
      action: "admin.mapbox.service_zone.create",
      entity_type: "service_zone",
      entity_id: zone.id,
      metadata: { provider_id: zone.provider_id, type: zone.zone_type, name: zone.name },
    });

    return NextResponse.json({
      data: transformedZone,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/mapbox/service-zones:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create service zone",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
