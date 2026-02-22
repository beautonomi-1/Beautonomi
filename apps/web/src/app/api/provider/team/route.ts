import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/team
 * Alias for /api/provider/staff — returns team members for the current provider.
 * The mobile app calls this endpoint; it queries the same `provider_staff` table.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");

    // If location_id provided, get staff assigned to that location first
    let staffIds: string[] | null = null;
    if (locationId) {
      const { data: assignments, error: assignmentError } = await supabase
        .from("provider_staff_locations")
        .select("staff_id")
        .eq("location_id", locationId);

      if (assignmentError) {
        throw assignmentError;
      }

      staffIds = assignments?.map((a) => a.staff_id) || [];

      if (staffIds.length === 0) {
        return successResponse([]);
      }
    }

    let query = supabase
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
        commission_percentage,
        bio,
        mobile_ready
      `
      )
      .eq("provider_id", providerId);

    if (locationId && staffIds && staffIds.length > 0) {
      query = query.in("id", staffIds);
    }

    const { data: staff, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      throw error;
    }

    // Map database roles to API format
    const transformedStaff = (staff || []).map((member: any) => {
      const apiRole =
        member.role === "owner"
          ? "provider_owner"
          : member.role === "manager"
            ? "provider_manager"
            : "provider_staff";

      return {
        id: member.id,
        user_id: member.user_id,
        provider_id: member.provider_id,
        name: member.name || "Staff Member",
        email: member.email || "",
        phone: member.phone || null,
        avatar_url: member.avatar_url || null,
        bio: member.bio || null,
        role: apiRole,
        is_active: member.is_active ?? true,
        commission_percentage: member.commission_percentage ?? 0,
        mobileReady: member.mobile_ready ?? false,
      };
    });

    return successResponse(transformedStaff);
  } catch (error) {
    return handleApiError(error, "Failed to fetch team members");
  }
}
