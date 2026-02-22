import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/distance-settings
 * Get distance settings for the provider
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

    // Get distance settings from providers table
    const { data: provider, error } = await supabase
      .from("providers")
      .select("max_service_distance_km, is_distance_filter_enabled")
      .eq("id", providerId)
      .single();

    if (error) {
      throw error;
    }

    if (!provider) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const result = {
      max_service_distance_km: provider.max_service_distance_km || 10.00,
      is_distance_filter_enabled: provider.is_distance_filter_enabled || false,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load distance settings");
  }
}

/**
 * PATCH /api/provider/distance-settings
 * Update distance settings for the provider
 */
export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(permissionCheck.user!.id);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const updates: any = {};

    if (body.max_service_distance_km !== undefined) {
      const distance = parseFloat(body.max_service_distance_km);
      if (isNaN(distance) || distance < 1 || distance > 100) {
        return handleApiError(
          new Error("Invalid distance"),
          "Distance must be between 1 and 100 km",
          "VALIDATION_ERROR",
          400
        );
      }
      updates.max_service_distance_km = distance;
    }

    if (body.is_distance_filter_enabled !== undefined) {
      updates.is_distance_filter_enabled = Boolean(body.is_distance_filter_enabled);
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select("max_service_distance_km, is_distance_filter_enabled")
      .single();

    if (error) {
      throw error;
    }

    const result = {
      max_service_distance_km: provider.max_service_distance_km || 10.00,
      is_distance_filter_enabled: provider.is_distance_filter_enabled || false,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to update distance settings");
  }
}
