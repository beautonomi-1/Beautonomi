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
  getStaffPermissions,
  resolveStaffPermissionRow,
  type StaffPermissions,
} from "@/lib/auth/permissions";
import {
  staffPermissionsPatchSchema,
  staffPermissionsToStoredJson,
} from "@/lib/auth/staff-permissions-payload";
import { getProviderStaffIdForUser } from "@/lib/auth/provider-team-roster-access";
import { z } from "zod";

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
      .select("id, permissions, role, role_id, is_admin, user_id, provider_id");

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: staff, error: staffError } = await query.eq("id", id).single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    const permissions = await resolveStaffPermissionRow(
      supabase,
      staff,
      providerId ?? staff.provider_id,
    );

    let role_name: string | null = null;
    if (staff.role_id) {
      const { data: roleRow } = await supabase
        .from("provider_roles")
        .select("name")
        .eq("id", staff.role_id)
        .maybeSingle();
      role_name = (roleRow as { name?: string } | null)?.name ?? null;
    }

    return successResponse({
      permissions,
      role_id: staff.role_id ?? null,
      role_name,
    });
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
    const body = staffPermissionsPatchSchema.parse(await request.json());

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

    let verifyQuery = supabase
      .from("provider_staff")
      .select("id, user_id, role, is_admin, provider_id, role_id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existing } = await verifyQuery.single();

    if (!existing) {
      return notFoundResponse("Staff member not found");
    }

    const owner = await isProviderOwner(user.id, request);
    if (!owner && user.role !== "superadmin") {
      const ownStaffId = await getProviderStaffIdForUser(user.id, providerId!, supabase);
      if (ownStaffId === id) {
        return errorResponse("You cannot change your own permissions.", "FORBIDDEN", 403);
      }
    }

    const staffUserId = (existing as { user_id?: string | null }).user_id;
    if (providerId && staffUserId) {
      const { data: provRow } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", providerId)
        .maybeSingle();
      if (provRow?.user_id === staffUserId) {
        return errorResponse(
          "The linked business owner always has full access.",
          "FORBIDDEN",
          403,
        );
      }
    }

    const allowedKeys = new Set(Object.keys(getAllPermissions()));
    const rawPermissions: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(body.permissions)) {
      if (!allowedKeys.has(key)) continue;
      rawPermissions[key] = Boolean(value);
    }
    const storedPermissions = staffPermissionsToStoredJson(
      rawPermissions,
      body.calendar_scope,
    );
    const validatedPermissions = storedPermissions as Record<string, boolean> & {
      calendar_scope?: string;
    };

    if (!owner && user.role !== "superadmin") {
      const editorPerms = await getStaffPermissions(user.id, undefined, request);
      if (body.calendar_scope === "all" && editorPerms.manage_team !== true) {
        return errorResponse(
          "You cannot set calendar scope to all without Manage team.",
          "FORBIDDEN",
          403,
        );
      }
      for (const key of Object.keys(rawPermissions) as Array<keyof StaffPermissions>) {
        if (rawPermissions[key as string] === true && editorPerms[key] !== true) {
          return errorResponse(
            "You cannot grant a permission you do not have.",
            "FORBIDDEN",
            403,
          );
        }
      }
    }

    const updatePayload: Record<string, unknown> = {
      permissions: storedPermissions,
      updated_at: new Date().toISOString(),
    };
    if ((existing as { role_id?: string | null }).role_id) {
      updatePayload.role_id = null;
    }

    const { data, error } = await supabase
      .from("provider_staff")
      .update(updatePayload)
      .eq("id", id)
      .select("permissions, role_id")
      .single();

    if (error) {
      throw error;
    }

    const permissions = data?.permissions
      ? typeof data.permissions === "string"
        ? JSON.parse(data.permissions)
        : data.permissions
      : {};

    const resolved = await resolveStaffPermissionRow(
      supabase,
      {
        role: (existing as { role: string }).role,
        permissions: data?.permissions,
        role_id: data?.role_id,
        is_admin: (existing as { is_admin?: boolean }).is_admin,
        user_id: staffUserId,
        provider_id: providerId ?? undefined,
      },
      providerId ?? undefined,
    );

    return successResponse({ permissions: resolved, role_id: data?.role_id ?? null });
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
