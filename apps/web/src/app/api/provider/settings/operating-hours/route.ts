import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/settings/operating-hours
 * Return operating hours for the provider's locations.
 * Operating hours are stored in the `working_hours` JSONB column on `provider_locations`.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");

    let query = supabase
      .from("provider_locations")
      .select("id, name, working_hours, is_active, is_primary")
      .eq("provider_id", providerId);

    if (locationId) {
      query = query.eq("id", locationId);
    }

    const { data: locations, error } = await query.order("is_primary", {
      ascending: false,
    });

    if (error) {
      throw error;
    }

    const result = (locations || []).map((loc: any) => ({
      locationId: loc.id,
      locationName: loc.name,
      isPrimary: loc.is_primary ?? false,
      isActive: loc.is_active ?? true,
      workingHours: loc.working_hours || {},
    }));

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load operating hours");
  }
}

/**
 * PATCH /api/provider/settings/operating-hours
 * Update operating hours for a specific location.
 * Body: { locationId: string, workingHours: Record<string, { is_open, open_time, close_time }> }
 */
export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { locationId, workingHours } = body;

    if (!locationId) {
      return handleApiError(
        new Error("locationId is required"),
        "locationId is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify the location belongs to this provider
    const { data: location, error: locError } = await supabase
      .from("provider_locations")
      .select("id")
      .eq("id", locationId)
      .eq("provider_id", providerId)
      .single();

    if (locError || !location) {
      return notFoundResponse("Location not found");
    }

    const { data: updated, error } = await supabase
      .from("provider_locations")
      .update({ working_hours: workingHours })
      .eq("id", locationId)
      .eq("provider_id", providerId)
      .select("id, name, working_hours, is_active, is_primary")
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      locationId: updated.id,
      locationName: updated.name,
      isPrimary: updated.is_primary ?? false,
      isActive: updated.is_active ?? true,
      workingHours: updated.working_hours || {},
    });
  } catch (error) {
    return handleApiError(error, "Failed to update operating hours");
  }
}
