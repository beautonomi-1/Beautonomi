import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  badRequestResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const serviceZoneSchema = z.object({
  name: z.string().min(1, "Name is required"),
  zone_type: z.enum(["postal_code", "city", "polygon", "radius"]),
  postal_codes: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  polygon_coordinates: z.any().optional(), // JSONB
  center_latitude: z.number().optional(),
  center_longitude: z.number().optional(),
  radius_km: z.number().positive().optional(),
  travel_fee: z.number().min(0),
  currency: z.string().length(3).default("ZAR"),
  travel_time_minutes: z.number().int().positive().default(30),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

/**
 * GET /api/provider/service-zones
 * Get all service zones for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { data: zones, error } = await supabase
      .from("service_zones")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(zones || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch service zones");
  }
}

/**
 * POST /api/provider/service-zones
 * Create a new service zone
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const body = await request.json();
    const validationResult = serviceZoneSchema.safeParse(body);

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
      .from("service_zones")
      .insert({
        provider_id: providerId,
        name: data.name,
        zone_type: data.zone_type,
        postal_codes: data.postal_codes || null,
        cities: data.cities || null,
        polygon_coordinates: data.polygon_coordinates || null,
        center_latitude: data.center_latitude || null,
        center_longitude: data.center_longitude || null,
        radius_km: data.radius_km || null,
        travel_fee: data.travel_fee,
        currency: data.currency,
        travel_time_minutes: data.travel_time_minutes,
        description: data.description || null,
        is_active: data.is_active,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to create service zone");
  }
}
