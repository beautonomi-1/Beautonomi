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
 * Default roles available to all providers.
 * The database stores roles as plain text in provider_staff.role
 * (owner | manager | employee). This endpoint returns the role definitions
 * with their display names and permissions so the mobile app can render
 * role-management screens.
 */
const DEFAULT_ROLES = [
  {
    id: "owner",
    name: "Owner",
    description: "Full access to all settings and data",
    permissions: [
      "manage_team",
      "edit_settings",
      "view_reports",
      "manage_bookings",
      "manage_clients",
      "manage_services",
      "manage_billing",
    ],
    isSystem: true,
  },
  {
    id: "manager",
    name: "Manager",
    description: "Can manage team, bookings, and view reports",
    permissions: [
      "manage_team",
      "view_reports",
      "manage_bookings",
      "manage_clients",
      "manage_services",
    ],
    isSystem: true,
  },
  {
    id: "employee",
    name: "Staff Member",
    description: "Can view own schedule and manage assigned bookings",
    permissions: ["manage_bookings", "manage_clients"],
    isSystem: true,
  },
];

/**
 * GET /api/provider/settings/team/roles
 * Return team roles with their permissions.
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

    // Get provider_settings for any custom role configuration
    const { data: _settings } = await supabase
      .from("provider_settings")
      .select("id")
      .eq("provider_id", providerId)
      .maybeSingle();

    // Count staff in each role for context
    const { data: staffCounts } = await supabase
      .from("provider_staff")
      .select("role")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    const roleCounts: Record<string, number> = {};
    (staffCounts || []).forEach((s: any) => {
      roleCounts[s.role] = (roleCounts[s.role] || 0) + 1;
    });

    const roles = DEFAULT_ROLES.map((role) => ({
      ...role,
      staffCount: roleCounts[role.id] || 0,
    }));

    return successResponse(roles);
  } catch (error) {
    return handleApiError(error, "Failed to load team roles");
  }
}

/**
 * POST /api/provider/settings/team/roles
 * Create or update a custom role.
 * Body: { id?: string, name: string, description?: string, permissions: string[] }
 *
 * Note: The current schema stores roles as plain text on provider_staff.
 * This endpoint provides a structured role definition the mobile app can use,
 * but actual role assignment still uses the standard owner/manager/employee values.
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("manage_team", request);
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

    const { name, description, permissions } = body;

    if (!name || typeof name !== "string") {
      return handleApiError(
        new Error("name is required"),
        "name is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Ensure provider_settings row exists for this provider
    const { data: existing } = await supabase
      .from("provider_settings")
      .select("id")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!existing) {
      await supabase
        .from("provider_settings")
        .insert({ provider_id: providerId });
    }

    // Return the role definition (the mobile app caches this)
    const roleId = name.toLowerCase().replace(/\s+/g, "_");

    const role = {
      id: roleId,
      name,
      description: description || "",
      permissions: Array.isArray(permissions) ? permissions : [],
      isSystem: false,
      staffCount: 0,
    };

    return successResponse(role, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create role");
  }
}
