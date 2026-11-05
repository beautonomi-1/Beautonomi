import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import {
  getAllPermissions,
  getStaffPermissions,
  isProviderOwner,
  isProviderOwnerOrManager,
} from "@/lib/auth/permissions";

/**
 * GET /api/provider/permissions
 * 
 * Get current user's permissions
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);

    // Check if user is provider owner
    const isOwner = await isProviderOwner(user.id, request);

    if (isOwner) {
      return successResponse({
        isOwner: true,
        isManager: true,
        permissions: getAllPermissions(),
      });
    }

    // Get staff permissions
    const permissions = await getStaffPermissions(user.id, undefined, request);
    const isManager = await isProviderOwnerOrManager(user.id, request);

    return successResponse({
      isOwner: false,
      isManager,
      permissions
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch permissions");
  }
}
