import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { getTeamRosterDetailLevel, redactStaffRowForViewer } from "@/lib/auth/provider-team-roster-access";

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

    const rosterDetailLevel = await getTeamRosterDetailLevel(user.id, request);

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
        // Legacy fallback: if location belongs to this provider but has no mapping rows yet,
        // return all provider staff rather than empty list.
        const { data: locationRow } = await supabase
          .from("provider_locations")
          .select("id")
          .eq("id", locationId)
          .eq("provider_id", providerId)
          .maybeSingle();
        if (!locationRow) {
          return successResponse([]);
        }
        staffIds = null;
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
        mobile_ready,
        working_hours
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
    const transformedStaff = (staff || []).map((member: Record<string, unknown>) => {
      const apiRole =
        member.role === "owner"
          ? "provider_owner"
          : member.role === "manager"
            ? "provider_manager"
            : "provider_staff";

      const row = {
        id: member.id as string,
        user_id: member.user_id as string | null,
        provider_id: member.provider_id as string,
        name: (member.name as string) || "Staff Member",
        email: (member.email as string) || "",
        phone: (member.phone as string | null) || null,
        avatar_url: (member.avatar_url as string | null) || null,
        bio: (member.bio as string | null) || null,
        role: apiRole,
        is_active: (member.is_active as boolean) ?? true,
        commission_percentage: (member.commission_percentage as number) ?? 0,
        mobileReady: (member.mobile_ready as boolean) ?? false,
      };
      return redactStaffRowForViewer(row, user.id, rosterDetailLevel);
    });

    return successResponse(transformedStaff);
  } catch (error) {
    return handleApiError(error, "Failed to fetch team members");
  }
}
