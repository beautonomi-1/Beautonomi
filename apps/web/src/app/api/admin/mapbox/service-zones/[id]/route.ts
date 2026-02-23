import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";

const updateServiceZoneSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["radius", "polygon"]).optional(),
  coordinates: z
    .union([
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
    ])
    .optional(),
  radius_km: z.number().min(0).optional(),
  is_active: z.boolean().optional(),
  provider_id: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/admin/mapbox/service-zones/[id]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: zone, error } = await supabase
      .from("service_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !zone) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Service zone not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check access for provider_owner
    if (auth.user.role === "provider_owner" && (zone as any).provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", (zone as any).provider_id)
        .eq("user_id", auth.user.id)
        .single();

      if (!provider) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Access denied",
              code: "FORBIDDEN",
            },
          },
          { status: 403 }
        );
      }
    }

    // Transform database schema to match frontend expectations
    const transformedZone: any = {
      id: zone.id,
      name: zone.name,
      type: zone.zone_type, // zone_type -> type
      is_active: zone.is_active,
      provider_id: zone.provider_id,
      radius_km: zone.radius_km,
    };

    // Transform coordinates based on zone type
    if (zone.zone_type === "radius") {
      transformedZone.coordinates = {
        longitude: zone.center_longitude,
        latitude: zone.center_latitude,
      };
    } else if (zone.zone_type === "polygon") {
      // Transform polygon_coordinates from [[lat, lng], ...] to [{longitude, latitude}, ...]
      if (Array.isArray(zone.polygon_coordinates)) {
        transformedZone.coordinates = zone.polygon_coordinates.map((coord: any) => {
          if (Array.isArray(coord) && coord.length >= 2) {
            return {
              longitude: coord[1], // lng is second
              latitude: coord[0],  // lat is first
            };
          }
          return coord;
        });
      } else {
        transformedZone.coordinates = [];
      }
    }

    return NextResponse.json({
      data: transformedZone,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch service zone",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/mapbox/service-zones/[id]
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = updateServiceZoneSchema.safeParse(body);
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

    // Check existing zone
    const { data: existing } = await supabase
      .from("service_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Service zone not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check access for provider_owner
    if (auth.user.role === "provider_owner" && (existing as any).provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", (existing as any).provider_id)
        .eq("user_id", auth.user.id)
        .single();

      if (!provider) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Access denied",
              code: "FORBIDDEN",
            },
          },
          { status: 403 }
        );
      }
    }

    // Transform frontend schema to database schema
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (validationResult.data.name !== undefined) {
      updateData.name = validationResult.data.name;
    }
    if (validationResult.data.is_active !== undefined) {
      updateData.is_active = validationResult.data.is_active;
    }
    if (validationResult.data.provider_id !== undefined) {
      updateData.provider_id = validationResult.data.provider_id;
    }
    if (validationResult.data.radius_km !== undefined) {
      updateData.radius_km = validationResult.data.radius_km;
    }
    if (validationResult.data.type !== undefined) {
      updateData.zone_type = validationResult.data.type; // type -> zone_type
    }

    // Handle coordinates transformation
    if (validationResult.data.coordinates !== undefined) {
      const zoneType = validationResult.data.type || existing.zone_type;
      
      if (zoneType === "radius") {
        const coords = validationResult.data.coordinates as { longitude: number; latitude: number };
        updateData.center_longitude = coords.longitude;
        updateData.center_latitude = coords.latitude;
        updateData.polygon_coordinates = null; // Clear polygon data
      } else if (zoneType === "polygon") {
        const coords = validationResult.data.coordinates as Array<{ longitude: number; latitude: number }>;
        updateData.polygon_coordinates = coords.map((coord) => [coord.latitude, coord.longitude]);
        updateData.center_longitude = null; // Clear radius data
        updateData.center_latitude = null;
        updateData.radius_km = null;
      }
    }

    const { data: zone, error } = await (supabase
      .from("service_zones") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error || !zone) {
      console.error("Error updating service zone:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update service zone",
            code: "UPDATE_ERROR",
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

    return NextResponse.json({
      data: transformedZone,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update service zone",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/mapbox/service-zones/[id]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    // Check existing zone
    const { data: existing } = await supabase
      .from("service_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Service zone not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check access for provider_owner
    if (auth.user.role === "provider_owner" && (existing as any).provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", (existing as any).provider_id)
        .eq("user_id", auth.user.id)
        .single();

      if (!provider) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Access denied",
              code: "FORBIDDEN",
            },
          },
          { status: 403 }
        );
      }
    }

    const { error } = await (supabase
      .from("service_zones") as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Error deleting service zone:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete service zone",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { id, deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete service zone",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
