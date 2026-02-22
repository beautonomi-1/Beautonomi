import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  permissions: z.record(z.string(), z.boolean()),
});

/**
 * GET /api/provider/staff/[id]/permissions
 * Get permissions for a staff member
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // For superadmin, allow viewing any staff member's permissions
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the staff member
      const { data: staffCheck } = await supabase
        .from("provider_staff")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (staffCheck) {
        providerId = staffCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify staff member exists
    let query = supabase
      .from("provider_staff")
      .select("id, permissions, role, role_id, is_admin");

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: staff, error: staffError } = await query.eq("id", id).single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    // Get permissions: check role_id first, then direct permissions, then default role permissions
    let permissions: Record<string, boolean> = {};
    
    if (staff.role_id) {
      // Check custom role
      const { data: customRole } = await supabase
        .from("provider_roles")
        .select("permissions")
        .eq("id", staff.role_id)
        .single();
      
      if (customRole?.permissions) {
        permissions = typeof customRole.permissions === "string"
          ? JSON.parse(customRole.permissions)
          : customRole.permissions;
      }
    }
    
    // If no custom role or custom role has no permissions, check direct permissions
    if (Object.keys(permissions).length === 0 && staff.permissions) {
      permissions = typeof staff.permissions === "string"
        ? JSON.parse(staff.permissions)
        : staff.permissions;
    }
    
    // If still no permissions, use default for role (owner has all, manager/employee have defaults)
    if (Object.keys(permissions).length === 0) {
      if (staff.role === "owner" || staff.is_admin) {
        // Owner/admin has all permissions
        permissions = {
          view_calendar: true,
          create_appointments: true,
          edit_appointments: true,
          cancel_appointments: true,
          delete_appointments: true,
          view_sales: true,
          create_sales: true,
          process_payments: true,
          view_reports: true,
          view_services: true,
          edit_services: true,
          view_products: true,
          edit_products: true,
          view_team: true,
          manage_team: true,
          view_settings: true,
          edit_settings: true,
          view_clients: true,
          edit_clients: true,
        };
      } else {
        // Get default permissions for role
        const { data: defaultPerms } = await supabase.rpc(
          "get_default_permissions_for_role",
          { p_role: staff.role }
        );
        if (defaultPerms) {
          permissions = typeof defaultPerms === "string"
            ? JSON.parse(defaultPerms)
            : defaultPerms;
        }
      }
    }

    return successResponse({ permissions });
  } catch (error) {
    return handleApiError(error, "Failed to load permissions");
  }
}

/**
 * PATCH /api/provider/staff/[id]/permissions
 * Update permissions for a staff member
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Only provider owners and superadmins can update permissions
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    // For superadmin, allow updating any staff member's permissions
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the staff member
      const { data: staffCheck } = await supabase
        .from("provider_staff")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (staffCheck) {
        providerId = staffCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify staff member exists
    let verifyQuery = supabase
      .from("provider_staff")
      .select("id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existing } = await verifyQuery.single();

    if (!existing) {
      return notFoundResponse("Staff member not found");
    }

    // Validate permissions object - ensure all values are booleans
    const validatedPermissions: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(body.permissions)) {
      validatedPermissions[key] = Boolean(value);
    }

    const { data, error } = await supabase
      .from("provider_staff")
      .update({
        permissions: validatedPermissions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("permissions")
      .single();

    if (error) {
      throw error;
    }

    const permissions = data?.permissions
      ? typeof data.permissions === "string"
        ? JSON.parse(data.permissions)
        : data.permissions
      : {};

    return successResponse({ permissions });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        error.issues
      );
    }
    return handleApiError(error, "Failed to update permissions");
  }
}
