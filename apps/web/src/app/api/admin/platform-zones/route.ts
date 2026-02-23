import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  badRequestResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const platformZoneSchema = z.object({
  name: z.string().min(1, "Name is required"),
  zone_type: z.enum(["postal_code", "city", "polygon", "radius"]),
  postal_codes: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  polygon_coordinates: z.any().optional(),
  center_latitude: z.number().optional(),
  center_longitude: z.number().optional(),
  radius_km: z.number().positive().optional(),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

/**
 * GET /api/admin/platform-zones
 * Get all platform zones (superadmin only)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const { data: zones, error } = await supabase
      .from("platform_zones")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(zones || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch platform zones");
  }
}

/**
 * POST /api/admin/platform-zones
 * Create a new platform zone (superadmin only)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const body = await request.json();
    const validationResult = platformZoneSchema.safeParse(body);

    if (!validationResult.success) {
      return badRequestResponse(
        validationResult.error.issues.map((i) => i.message).join(", ")
      );
    }

    const data = validationResult.data;

    // Validate zone type specific fields
    if (data.zone_type === "postal_code" && (!data.postal_codes || data.postal_codes.length === 0)) {
      return badRequestResponse("Postal codes are required for postal_code zones");
    }
    if (data.zone_type === "city" && (!data.cities || data.cities.length === 0)) {
      return badRequestResponse("Cities are required for city zones");
    }
    if (data.zone_type === "polygon" && !data.polygon_coordinates) {
      return badRequestResponse("Polygon coordinates are required for polygon zones");
    }
    if (data.zone_type === "radius") {
      if (!data.center_latitude || !data.center_longitude || !data.radius_km) {
        return badRequestResponse("Center coordinates and radius are required for radius zones");
      }
    }

    const { data: zone, error } = await supabase
      .from("platform_zones")
      .insert({
        name: data.name,
        zone_type: data.zone_type,
        postal_codes: data.postal_codes || null,
        cities: data.cities || null,
        polygon_coordinates: data.polygon_coordinates || null,
        center_latitude: data.center_latitude || null,
        center_longitude: data.center_longitude || null,
        radius_km: data.radius_km || null,
        description: data.description || null,
        is_active: data.is_active,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to create platform zone");
  }
}
