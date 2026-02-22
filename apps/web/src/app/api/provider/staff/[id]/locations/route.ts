import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateStaffLocationsSchema = z.object({
  location_ids: z.array(z.string().uuid()).min(1, "At least one location is required"),
  primary_location_id: z.string().uuid().optional(),
});

/**
 * GET /api/provider/staff/[id]/locations
 * 
 * Get staff member's location assignments
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const staffId = params.id;

    // Verify staff belongs to provider
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id, provider_id")
      .eq("id", staffId)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    // Get location assignments
    const { data: assignments, error } = await supabase
      .from("provider_staff_locations")
      .select(`
        location_id,
        is_primary,
        location:provider_locations(id, name, city, address_line1)
      `)
      .eq("staff_id", staffId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return successResponse(assignments || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch staff locations");
  }
}

/**
 * PUT /api/provider/staff/[id]/locations
 * 
 * Update staff member's location assignments
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check permission to manage team
    const permissionCheck = await requirePermission('manage_team', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const staffId = params.id;
    const body = await request.json();

    // Validate input
    const validationResult = updateStaffLocationsSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { location_ids, primary_location_id } = validationResult.data;

    // Verify staff belongs to provider
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id, provider_id")
      .eq("id", staffId)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    // Verify all locations belong to the provider
    const { data: locations } = await supabase
      .from("provider_locations")
      .select("id")
      .eq("provider_id", providerId)
      .in("id", location_ids);

    if (!locations || locations.length !== location_ids.length) {
      return errorResponse(
        "One or more locations not found or do not belong to your provider",
        "VALIDATION_ERROR",
        400
      );
    }

    // If primary_location_id is specified, verify it's in location_ids
    if (primary_location_id && !location_ids.includes(primary_location_id)) {
      return errorResponse(
        "Primary location must be included in location assignments",
        "VALIDATION_ERROR",
        400
      );
    }

    // Delete existing assignments
    const { error: deleteError } = await supabase
      .from("provider_staff_locations")
      .delete()
      .eq("staff_id", staffId);

    if (deleteError) {
      throw deleteError;
    }

    // Insert new assignments
    const assignments = location_ids.map((locId) => ({
      staff_id: staffId,
      location_id: locId,
      is_primary: primary_location_id === locId,
    }));

    const { data: newAssignments, error: insertError } = await supabase
      .from("provider_staff_locations")
      .insert(assignments)
      .select(`
        location_id,
        is_primary,
        location:provider_locations(id, name, city)
      `);

    if (insertError) {
      throw insertError;
    }

    return successResponse(newAssignments || []);
  } catch (error) {
    return handleApiError(error, "Failed to update staff locations");
  }
}

/**
 * DELETE /api/provider/staff/[id]/locations
 * 
 * Remove all location assignments for a staff member
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check permission to manage team
    const permissionCheck = await requirePermission('manage_team', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const staffId = params.id;

    // Verify staff belongs to provider
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id, provider_id")
      .eq("id", staffId)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    // Delete all assignments
    const { error } = await supabase
      .from("provider_staff_locations")
      .delete()
      .eq("staff_id", staffId);

    if (error) {
      throw error;
    }

    return successResponse({ message: "Location assignments removed" });
  } catch (error) {
    return handleApiError(error, "Failed to remove staff locations");
  }
}
