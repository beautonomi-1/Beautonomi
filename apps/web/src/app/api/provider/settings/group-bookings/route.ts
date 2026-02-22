import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const patchSchema = z.object({
  enable_group_booking: z.boolean().optional(),
  allow_online_group_booking: z.boolean().optional(),
  max_group_size: z.number().min(2).max(10).optional(),
  enabled_locations: z.array(z.string()).optional(),
  excluded_services: z.array(z.string()).optional(),
});

/**
 * GET /api/provider/settings/group-bookings
 * Get group booking settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .select(
        "group_booking_enabled, online_group_booking_enabled, max_group_size, group_booking_locations, group_booking_excluded_services"
      )
      .eq("id", providerId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    const enabledLocations = provider?.group_booking_locations
      ? typeof provider.group_booking_locations === "string"
        ? JSON.parse(provider.group_booking_locations)
        : provider.group_booking_locations
      : [];

    const excludedServices = provider?.group_booking_excluded_services
      ? typeof provider.group_booking_excluded_services === "string"
        ? JSON.parse(provider.group_booking_excluded_services)
        : provider.group_booking_excluded_services
      : [];

    return successResponse({
      enableGroupBooking: provider?.group_booking_enabled ?? false,
      allowOnlineGroupBooking: provider?.online_group_booking_enabled ?? false,
      maxGroupSize: provider?.max_group_size ?? 5,
      enabledLocations: Array.isArray(enabledLocations) ? enabledLocations : [],
      excludedServices: Array.isArray(excludedServices) ? excludedServices : [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load group booking settings");
  }
}

/**
 * PATCH /api/provider/settings/group-bookings
 * Update group booking settings
 */
export async function PATCH(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const body = patchSchema.parse(await request.json());

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.enable_group_booking !== undefined) {
      updateData.group_booking_enabled = body.enable_group_booking;
    }
    if (body.allow_online_group_booking !== undefined) {
      updateData.online_group_booking_enabled = body.allow_online_group_booking;
    }
    if (body.max_group_size !== undefined) {
      updateData.max_group_size = body.max_group_size;
    }
    if (body.enabled_locations !== undefined) {
      updateData.group_booking_locations = body.enabled_locations;
    }
    if (body.excluded_services !== undefined) {
      updateData.group_booking_excluded_services = body.excluded_services;
    }

    const { data, error } = await supabase
      .from("providers")
      .update(updateData)
      .eq("id", providerId)
      .select(
        "group_booking_enabled, online_group_booking_enabled, max_group_size, group_booking_locations, group_booking_excluded_services"
      )
      .single();

    if (error) {
      throw error;
    }

    const enabledLocations = data?.group_booking_locations
      ? typeof data.group_booking_locations === "string"
        ? JSON.parse(data.group_booking_locations)
        : data.group_booking_locations
      : [];

    const excludedServices = data?.group_booking_excluded_services
      ? typeof data.group_booking_excluded_services === "string"
        ? JSON.parse(data.group_booking_excluded_services)
        : data.group_booking_excluded_services
      : [];

    return successResponse({
      enableGroupBooking: data?.group_booking_enabled ?? false,
      allowOnlineGroupBooking: data?.online_group_booking_enabled ?? false,
      maxGroupSize: data?.max_group_size ?? 5,
      enabledLocations: Array.isArray(enabledLocations) ? enabledLocations : [],
      excludedServices: Array.isArray(excludedServices) ? excludedServices : [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to update group booking settings");
  }
}
