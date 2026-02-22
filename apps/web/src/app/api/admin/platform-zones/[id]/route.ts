import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updatePlatformZoneSchema = z.object({
  name: z.string().min(1).optional(),
  zone_type: z.enum(["postal_code", "city", "polygon", "radius"]).optional(),
  postal_codes: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  polygon_coordinates: z.any().optional(),
  center_latitude: z.number().optional(),
  center_longitude: z.number().optional(),
  radius_km: z.number().positive().optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/platform-zones/[id]
 * Get a specific platform zone (superadmin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data: zone, error } = await supabase
      .from("platform_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !zone) {
      return notFoundResponse("Platform zone not found");
    }

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to fetch platform zone");
  }
}

/**
 * PATCH /api/admin/platform-zones/[id]
 * Update a platform zone (superadmin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data: existingZone, error: fetchError } = await supabase
      .from("platform_zones")
      .select("id, zone_type")
      .eq("id", id)
      .single();

    if (fetchError || !existingZone) {
      return notFoundResponse("Platform zone not found");
    }

    const body = await request.json();
    const validationResult = updatePlatformZoneSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        validationResult.error.issues.map((i) => i.message).join(", ")
      );
    }

    const data = validationResult.data;
    const zoneType = data.zone_type || existingZone.zone_type;

    // Validate zone type specific fields if zone_type is being updated
    if (data.zone_type) {
      if (zoneType === "postal_code" && (!data.postal_codes || data.postal_codes.length === 0)) {
        return errorResponse("Postal codes are required for postal_code zones");
      }
      if (zoneType === "city" && (!data.cities || data.cities.length === 0)) {
        return errorResponse("Cities are required for city zones");
      }
      if (zoneType === "polygon" && !data.polygon_coordinates) {
        return errorResponse("Polygon coordinates are required for polygon zones");
      }
      if (zoneType === "radius") {
        if (!data.center_latitude || !data.center_longitude || !data.radius_km) {
          return errorResponse("Center coordinates and radius are required for radius zones");
        }
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.zone_type !== undefined) updateData.zone_type = data.zone_type;
    if (data.postal_codes !== undefined) updateData.postal_codes = data.postal_codes;
    if (data.cities !== undefined) updateData.cities = data.cities;
    if (data.polygon_coordinates !== undefined) updateData.polygon_coordinates = data.polygon_coordinates;
    if (data.center_latitude !== undefined) updateData.center_latitude = data.center_latitude;
    if (data.center_longitude !== undefined) updateData.center_longitude = data.center_longitude;
    if (data.radius_km !== undefined) updateData.radius_km = data.radius_km;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;

    const { data: zone, error } = await supabase
      .from("platform_zones")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to update platform zone");
  }
}

/**
 * DELETE /api/admin/platform-zones/[id]
 * Delete a platform zone (superadmin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    // Check if any providers have selected this zone
    const { data: selections, error: checkError } = await supabase
      .from("provider_zone_selections")
      .select("id")
      .eq("platform_zone_id", id)
      .limit(1);

    if (checkError) {
      throw checkError;
    }

    if (selections && selections.length > 0) {
      return errorResponse(
        "Cannot delete platform zone: Some providers have selected this zone. Please deactivate it instead."
      );
    }

    const { error } = await supabase
      .from("platform_zones")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete platform zone");
  }
}
