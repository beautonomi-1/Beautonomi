import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateStaffSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  role: z.string().optional(),
  is_active: z.boolean().optional(),
  mobileReady: z.boolean().optional(),
});

/**
 * GET /api/provider/staff/[id]
 * 
 * Get a specific staff member
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: staff, error } = await supabase
      .from("provider_staff")
      .select(
        `
        id,
        user_id,
        provider_id,
        name,
        email,
        phone,
        avatar_url,
        role,
        is_active,
        users:user_id(id, full_name, email, phone, avatar_url)
      `
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !staff) {
      return notFoundResponse("Staff member not found");
    }

    // Map database role format to API format
    const apiRole = staff.role === "owner" ? "provider_owner"
                 : staff.role === "manager" ? "provider_manager"
                 : "provider_staff";
    
    const transformedStaff = {
      id: staff.id,
      name: (staff as any).name || (staff as any).users?.full_name || "Staff Member",
      email: (staff as any).email || (staff as any).users?.email || "",
      phone: (staff as any).phone || (staff as any).users?.phone || null,
      avatar_url: (staff as any).avatar_url || (staff as any).users?.avatar_url || null,
      role: apiRole,
      is_active: staff.is_active ?? true,
      mobileReady: (staff as any).mobileReady ?? false,
    };

    return successResponse(transformedStaff);
  } catch (error) {
    return handleApiError(error, "Failed to fetch staff member");
  }
}

/**
 * PATCH /api/provider/staff/[id]
 * 
 * Update a staff member
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = updateStaffSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff belongs to provider
    const { data: existingStaff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingStaff) {
      return notFoundResponse("Staff member not found");
    }

    // Build update data
    // Map API role format to database format
    const updateData: Record<string, unknown> = {};
    if (validationResult.data.name !== undefined) {
      updateData.name = validationResult.data.name;
    }
    if (validationResult.data.email !== undefined) {
      updateData.email = validationResult.data.email;
    }
    if (validationResult.data.phone !== undefined) {
      updateData.phone = validationResult.data.phone;
    }
    if (validationResult.data.avatar_url !== undefined) {
      updateData.avatar_url = validationResult.data.avatar_url;
    }
    if (validationResult.data.role !== undefined) {
      // Map API role format to database format
      // API uses: provider_staff, provider_manager, provider_owner
      // Database expects: employee, manager, owner
      const dbRole = validationResult.data.role === "provider_owner" ? "owner" 
                   : validationResult.data.role === "provider_manager" ? "manager" 
                   : "employee";
      updateData.role = dbRole;
    }
    if (validationResult.data.is_active !== undefined) {
      updateData.is_active = validationResult.data.is_active;
    }
    if (validationResult.data.mobileReady !== undefined) {
      updateData.mobile_ready = validationResult.data.mobileReady; // Map camelCase to snake_case for database
    }

    // Update staff
    const { data: updatedStaff, error: updateError } = await (supabase
      .from("provider_staff") as any)
      .update(updateData)
      .eq("id", id)
      .select(
        `
        id,
        user_id,
        provider_id,
        name,
        email,
        phone,
        avatar_url,
        role,
        is_active,
        users:user_id(id, full_name, email, phone, avatar_url)
      `
      )
      .single();

    if (updateError || !updatedStaff) {
      throw updateError || new Error("Failed to update staff member");
    }

    // Map database role format to API format
    const apiRole = updatedStaff.role === "owner" ? "provider_owner"
                 : updatedStaff.role === "manager" ? "provider_manager"
                 : "provider_staff";
    
    const transformedStaff = {
      id: updatedStaff.id,
      name: updatedStaff.name || updatedStaff.users?.full_name || "Staff Member",
      email: updatedStaff.email || updatedStaff.users?.email || "",
      phone: updatedStaff.phone || updatedStaff.users?.phone || null,
      avatar_url: updatedStaff.avatar_url || updatedStaff.users?.avatar_url || null,
      role: apiRole,
      is_active: updatedStaff.is_active ?? true,
    };

    return successResponse(transformedStaff);
  } catch (error) {
    return handleApiError(error, "Failed to update staff member");
  }
}

/**
 * DELETE /api/provider/staff/[id]
 * 
 * Remove a staff member
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff belongs to provider
    const { data: existingStaff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingStaff) {
      return notFoundResponse("Staff member not found");
    }

    // Delete staff member
    const { error: deleteError } = await supabase
      .from("provider_staff")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete staff member");
  }
}
