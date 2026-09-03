import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  handleApiError,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { resolveProviderStaffRowId } from "@/lib/provider/resolve-provider-staff-id";
import { getProviderStaffIdForUser } from "@/lib/auth/provider-team-roster-access";
import {
  findFutureBookingsForStaff,
  futureBookingsConflictResponse,
} from "@/lib/provider/find-future-bookings-for-staff";
import { notifyStaffUser } from "@/lib/notifications/notify-staff-event";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * DELETE /api/provider/staff/[id]/shifts/[scheduleId]
 * Delete a weekly schedule row (staff_schedules) for a staff member.
 * Used by provider mobile "Staff Schedules" when removing a day's shift.
 * Returns 409 FUTURE_BOOKINGS_CONFLICT when future bookings exist on that
 * weekday unless `?force=true`.
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

    // Owner / manage_team may edit anyone; staff may edit their own hours.
    const ownStaffId = await getProviderStaffIdForUser(user.id, providerId, supabase);
    if (user.role !== "superadmin" && ownStaffId !== staffId) {
      const manage = await requirePermission("manage_team", request);
      if (!manage.authorized) {
        return errorResponse("You can only edit your own schedule.", "FORBIDDEN", 403);
      }
    }

    const { data: existing } = await supabase
      .from("staff_schedules")
      .select("id, day_of_week")
      .eq("id", scheduleId)
      .eq("staff_id", staffId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!existing) return notFoundResponse("Schedule not found");

    const dayOfWeek = Number((existing as { day_of_week: number }).day_of_week);
    const force = request.nextUrl.searchParams.get("force") === "true";
    if (!force) {
      const { data: prov } = await supabase.from("providers").select("timezone").eq("id", providerId).maybeSingle();
      const conflicts = await findFutureBookingsForStaff(supabase, providerId, staffId, {
        outsideHours: {
          days: [{ day_of_week: dayOfWeek, start_time: null, end_time: null, is_working: false }],
          timezone: (prov as { timezone?: string | null } | null)?.timezone ?? undefined,
        },
      });
      if (conflicts.length > 0) {
        return errorResponse(
          `${conflicts.length} future booking(s) are scheduled on this day. Reschedule them or pass force=true to proceed.`,
          "FUTURE_BOOKINGS_CONFLICT",
          409,
          futureBookingsConflictResponse(conflicts),
        );
      }
    }

    const { error } = await supabase
      .from("staff_schedules")
      .delete()
      .eq("id", scheduleId)
      .eq("staff_id", staffId)
      .eq("provider_id", providerId);

    if (error) throw error;

    if (ownStaffId !== staffId) {
      void notifyStaffUser(staffId, "staff_schedule_changed", {
        title: "Your schedule changed",
        message: `Your ${DAY_LABELS[dayOfWeek] ?? "weekday"} shift was removed.`,
        url: "/provider/staff/schedule",
        metadata: { day_of_week: dayOfWeek, removed: true },
      }).catch(() => undefined);
    }

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete schedule");
  }
}
