import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { resolveProviderStaffRowId } from "@/lib/provider/resolve-provider-staff-id";
import { isProviderOwner } from "@/lib/auth/permissions";
import { isMissingRelationError, migrationRequiredResponse } from "@/lib/supabase/migration-required";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayOffId: string }> },
) {
  try {
    const authCheck = await requirePermission("view_calendar", request);
    if (!authCheck.authorized) {
      return authCheck.response!;
    }
    const { user } = authCheck;
    const supabase = await getSupabaseServer(request);
    const { id, dayOffId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const resolvedStaffId = await resolveProviderStaffRowId(supabase, providerId, id);
    if (!resolvedStaffId) {
      return notFoundResponse("Staff member not found");
    }

    const owner = await isProviderOwner(user.id, request);
    if (!owner) {
      const { data: selfStaff } = await supabase
        .from("provider_staff")
        .select("id")
        .eq("provider_id", providerId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      const isSelf = selfStaff?.id === resolvedStaffId;
      if (!isSelf) {
        const manageCheck = await requirePermission("manage_team", request);
        if (!manageCheck.authorized) {
          return manageCheck.response ?? errorResponse("Permission denied", "FORBIDDEN", 403);
        }
      }
    }

    const { data: existingDayOff } = await supabase
      .from("staff_days_off")
      .select("date")
      .eq("id", dayOffId)
      .eq("staff_id", resolvedStaffId)
      .maybeSingle();

    const { error: deleteError } = await supabase
      .from("staff_days_off")
      .delete()
      .eq("id", dayOffId)
      .eq("staff_id", resolvedStaffId);

    if (deleteError) {
      if (isMissingRelationError(deleteError)) {
        return migrationRequiredResponse("Staff days off");
      }
      throw deleteError;
    }

    if ((existingDayOff as { date?: string } | null)?.date) {
      await supabase
        .from("staff_time_off")
        .delete()
        .eq("staff_id", resolvedStaffId)
        .eq("provider_id", providerId)
        .eq("start_date", (existingDayOff as { date: string }).date)
        .eq("end_date", (existingDayOff as { date: string }).date)
        .eq("status", "approved");
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete day off");
  }
}
