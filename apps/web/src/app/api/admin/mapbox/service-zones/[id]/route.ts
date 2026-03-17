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

type ServiceZoneRow = {
  id: string;
  name: string | null;
  zone_type: string;
  is_active: boolean | null;
  provider_id: string | null;
  radius_km: number | null;
  center_longitude: number | null;
  center_latitude: number | null;
  polygon_coordinates: [number, number][] | null;
};

type TransformedZone = {
  id: string;
  name: string | null;
  type: string;
  is_active: boolean | null;
  provider_id: string | null;
  radius_km: number | null;
  coordinates?:
    | { longitude: number; latitude: number }
    | Array<{ longitude: number; latitude: number }>;
};

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

    const zoneRow = zone as ServiceZoneRow;
    if (auth.user.role === "provider_owner" && zoneRow.provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", zoneRow.provider_id)
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

    const transformedZone: TransformedZone = {
      id: zoneRow.id,
      name: zoneRow.name,
      type: zoneRow.zone_type,
      is_active: zoneRow.is_active,
      provider_id: zoneRow.provider_id,
      radius_km: zoneRow.radius_km,
    };

    if (zoneRow.zone_type === "radius") {
      transformedZone.coordinates = {
        longitude: zoneRow.center_longitude ?? 0,
        latitude: zoneRow.center_latitude ?? 0,
      };
    } else if (zoneRow.zone_type === "polygon") {
      if (Array.isArray(zoneRow.polygon_coordinates)) {
        transformedZone.coordinates = zoneRow.polygon_coordinates.map((coord: [number, number]) => {
          if (coord.length >= 2) {
            return { longitude: coord[1], latitude: coord[0] };
          }
          return { longitude: 0, latitude: 0 };
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

    const existingRow = existing as ServiceZoneRow;
    if (auth.user.role === "provider_owner" && existingRow.provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", existingRow.provider_id)
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

    const updateData: Record<string, unknown> = {
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
      updateData.zone_type = validationResult.data.type;
    }

    if (validationResult.data.coordinates !== undefined) {
      const zoneType = validationResult.data.type ?? existingRow.zone_type;
      
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

    const { data: zone, error } = await supabase
      .from("service_zones")
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

    const zoneResult = zone as ServiceZoneRow;
    const transformedZone: TransformedZone = {
      id: zoneResult.id,
      name: zoneResult.name,
      type: zoneResult.zone_type,
      is_active: zoneResult.is_active,
      provider_id: zoneResult.provider_id,
      radius_km: zoneResult.radius_km,
    };

    if (zoneResult.zone_type === "radius") {
      transformedZone.coordinates = {
        longitude: zoneResult.center_longitude ?? 0,
        latitude: zoneResult.center_latitude ?? 0,
      };
    } else if (zoneResult.zone_type === "polygon") {
      if (Array.isArray(zoneResult.polygon_coordinates)) {
        transformedZone.coordinates = zoneResult.polygon_coordinates.map((coord: [number, number]) => {
          if (coord.length >= 2) {
            return { longitude: coord[1], latitude: coord[0] };
          }
          return { longitude: 0, latitude: 0 };
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

    const existingRow = existing as ServiceZoneRow;
    if (auth.user.role === "provider_owner" && existingRow.provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", existingRow.provider_id)
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

    const { error } = await supabase
      .from("service_zones")
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
