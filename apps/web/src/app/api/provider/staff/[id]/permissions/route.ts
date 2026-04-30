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
import {
  getAllPermissions,
  isProviderOwner,
  hasPermission,
  normalizeStaffPermissions,
} from "@/lib/auth/permissions";
import { getProviderStaffIdForUser } from "@/lib/auth/provider-team-roster-access";
import { z } from "zod";

const patchSchema = z.object({
  permissions: z.record(z.string(), z.boolean()),
});

function parsePermissionPayload(payload: unknown): {
  hasPayload: boolean;
  valid: boolean;
  value: Record<string, unknown>;
} {
  if (payload == null) return { hasPayload: false, valid: true, value: {} };
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return { hasPayload: false, valid: true, value: {} };
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? { hasPayload: true, valid: true, value: parsed as Record<string, unknown> }
        : { hasPayload: true, valid: false, value: {} };
    } catch {
      return { hasPayload: true, valid: false, value: {} };
    }
  }
  if (typeof payload === "object" && !Array.isArray(payload)) {
    return { hasPayload: true, valid: true, value: payload as Record<string, unknown> };
  }
  return { hasPayload: true, valid: false, value: {} };
}

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

    if (user.role !== "superadmin" && providerId) {
      const ownStaffId = await getProviderStaffIdForUser(user.id, providerId, supabase);
      const canViewOthers =
        (await isProviderOwner(user.id, request)) ||
        (await hasPermission(user.id, "manage_team", undefined, request));
      if (!canViewOthers && ownStaffId !== id) {
        return errorResponse(
          "You can only view your own permissions.",
          "FORBIDDEN",
          403,
        );
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

    // Get permissions: custom role, direct overrides, then full default access.
    let permissions: Record<string, boolean> = {};
    let usedCustomRole = false;
    let usedDirectPermissions = false;

    if (staff.role_id) {
      usedCustomRole = true;
      const { data: customRole } = await supabase
        .from("provider_roles")
        .select("permissions, is_active")
        .eq("id", staff.role_id)
        .single();

      if (customRole && customRole.is_active !== false) {
        const parsed = parsePermissionPayload(customRole.permissions);
        permissions = parsed.valid
          ? normalizeStaffPermissions(parsed.value) as Record<string, boolean>
          : {};
      }
    }

    if (!usedCustomRole && Object.keys(permissions).length === 0 && staff.permissions) {
      const parsed = parsePermissionPayload(staff.permissions);
      usedDirectPermissions = parsed.hasPayload && (!parsed.valid || Object.keys(parsed.value).length > 0);
      permissions = parsed.valid
        ? normalizeStaffPermissions(parsed.value) as Record<string, boolean>
        : {};
    }

    if (!usedCustomRole && !usedDirectPermissions && Object.keys(permissions).length === 0) {
      permissions = { ...getAllPermissions() } as Record<string, boolean>;
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
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    if (user.role !== "superadmin") {
      const canEdit =
        (await isProviderOwner(user.id, request)) ||
        (await hasPermission(user.id, "manage_team", undefined, request));
      if (!canEdit) {
        return errorResponse(
          "Only owners or users with Manage team can edit permissions.",
          "FORBIDDEN",
          403,
        );
      }
    }

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
