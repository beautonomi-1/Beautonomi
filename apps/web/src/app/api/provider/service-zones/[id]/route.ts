import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  badRequestResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateServiceZoneSchema = z.object({
  name: z.string().min(1).optional(),
  zone_type: z.enum(["postal_code", "city", "polygon", "radius"]).optional(),
  postal_codes: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  polygon_coordinates: z.any().optional(),
  center_latitude: z.number().optional(),
  center_longitude: z.number().optional(),
  radius_km: z.number().positive().optional(),
  travel_fee: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  travel_time_minutes: z.number().int().positive().optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/service-zones/[id]
 * Get a specific service zone
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { data: zone, error } = await supabase
      .from("service_zones")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !zone) {
      return notFoundResponse("Service zone not found");
    }

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to fetch service zone");
  }
}

/**
 * PATCH /api/provider/service-zones/[id]
 * Update a service zone
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    // Verify zone belongs to provider
    const { data: existingZone, error: fetchError } = await supabase
      .from("service_zones")
      .select("id, zone_type")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !existingZone) {
      return notFoundResponse("Service zone not found");
    }

    const body = await request.json();
    const validationResult = updateServiceZoneSchema.safeParse(body);

    if (!validationResult.success) {
      return badRequestResponse(
        validationResult.error.issues.map((i) => i.message).join(", ")
      );
    }

    const data = validationResult.data;
    const zoneType = data.zone_type || existingZone.zone_type;

    // Validate zone type specific fields if zone_type is being updated
    if (data.zone_type) {
      if (zoneType === "postal_code" && (!data.postal_codes || data.postal_codes.length === 0)) {
        return badRequestResponse("Postal codes are required for postal_code zones");
      }
      if (zoneType === "city" && (!data.cities || data.cities.length === 0)) {
        return badRequestResponse("Cities are required for city zones");
      }
      if (zoneType === "polygon" && !data.polygon_coordinates) {
        return badRequestResponse("Polygon coordinates are required for polygon zones");
      }
      if (zoneType === "radius") {
        if (!data.center_latitude || !data.center_longitude || !data.radius_km) {
          return badRequestResponse("Center coordinates and radius are required for radius zones");
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
    if (data.travel_fee !== undefined) updateData.travel_fee = data.travel_fee;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.travel_time_minutes !== undefined) updateData.travel_time_minutes = data.travel_time_minutes;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;

    const { data: zone, error } = await supabase
      .from("service_zones")
      .update(updateData)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to update service zone");
  }
}

/**
 * DELETE /api/provider/service-zones/[id]
 * Delete a service zone
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { error } = await supabase
      .from("service_zones")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete service zone");
  }
}
