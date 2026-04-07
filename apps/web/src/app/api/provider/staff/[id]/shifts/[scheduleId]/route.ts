import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  handleApiError,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveProviderStaffRowId } from "@/lib/provider/resolve-provider-staff-id";

/**
 * DELETE /api/provider/staff/[id]/shifts/[scheduleId]
 * Delete a weekly schedule row (staff_schedules) for a staff member.
 * Used by provider mobile "Staff Schedules" when removing a day's shift.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  try {
    const { id: routeStaffId, scheduleId } = await params;
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const staffId = await resolveProviderStaffRowId(supabase, providerId, routeStaffId);
    if (!staffId) return notFoundResponse("Staff member not found");

    const { error } = await supabase
      .from("staff_schedules")
      .delete()
      .eq("id", scheduleId)
      .eq("staff_id", staffId)
      .eq("provider_id", providerId);

    if (error) throw error;

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete schedule");
  }
}
