import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { dateRangeBoundsUtc, getDayInTz, resolveTz } from "@/lib/dates/provider-tz";
import { resolveStaffLocationScope } from "@/lib/provider/staff-location-scope";
import { loadEffectiveStaffShifts } from "@/lib/availability/load-constraints";
import { segmentFitsAnyShift, shiftWallTimeToMinutes } from "@/lib/availability/shift-fit";

/**
 * GET /api/provider/staff/available
 *
 * Get available staff for a specific date/time and service
 *
 * Query params:
 * - date: YYYY-MM-DD
 * - startTime: HH:mm
 * - endTime: HH:mm
 * - offering_id: UUID (optional — filter by who offers this service)
 * - locationId: UUID (optional - filter by location)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({ data: [] });
    }

    const { data: tzRow } = await supabase
      .from("providers")
      .select("timezone")
      .eq("id", providerId)
      .maybeSingle();
    const tz = resolveTz((tzRow as { timezone?: string | null } | null)?.timezone);

    const date = searchParams.get('date');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const offeringId = searchParams.get("offering_id")?.trim() || null;
    const locationId = searchParams.get('locationId');

    const scope = await resolveStaffLocationScope(supabase, providerId, locationId);
    if (locationId && scope.staffIds !== null && scope.staffIds.length === 0) {
      return successResponse({ data: [] });
    }

    let offeringStaffIds: Set<string> | null = null;
    if (offeringId) {
      const { data: ssRows } = await supabase
        .from("staff_services")
        .select("staff_id")
        .eq("offering_id", offeringId);
      const ids = (ssRows ?? []).map((r: { staff_id: string }) => r.staff_id);
      if (ids.length > 0) {
        offeringStaffIds = new Set(ids);
      }
    }

    let query = supabase
      .from("provider_staff")
      .select(`
        *,
        staff_time_off!left(start_date, end_date, reason, status)
      `)
      .eq("provider_id", providerId)
      .eq("is_active", true);

    if (scope.staffIds && scope.staffIds.length > 0) {
      query = query.in("id", scope.staffIds);
    }

    const { data: staff, error } = await query;

    if (error) {
      throw error;
    }

    if (!staff?.length) {
      return successResponse({ data: [] });
    }

    const existingBookingsMap: Record<string, unknown[]> = {};
    if (date && startTime && endTime) {
      const { data: dayBookings } = await supabase
        .from("booking_services")
        .select("staff_id, start_time, end_time, booking:bookings!inner(status, scheduled_at)")
        .eq("booking.provider_id", providerId)
        .in("booking.status", ["confirmed", "checked_in", "in_progress"]);

      for (const bs of dayBookings || []) {
        if (!existingBookingsMap[bs.staff_id]) existingBookingsMap[bs.staff_id] = [];
        existingBookingsMap[bs.staff_id].push(bs);
      }
    }

    const { isExplicitServiceProvider } = await import("@/lib/provider/staff-public-bookable");

    const dateYmd = date?.slice(0, 10) ?? "";
    const segStartMin =
      startTime && endTime ? shiftWallTimeToMinutes(startTime) : null;
    const segEndMin =
      startTime && endTime ? shiftWallTimeToMinutes(endTime) : null;

    const availableStaff = [];
    for (const member of staff) {
      if (!isExplicitServiceProvider(member as { is_service_provider?: boolean | null })) {
        continue;
      }
      if (offeringStaffIds && !offeringStaffIds.has(member.id)) {
        continue;
      }

      if (date) {
        const isOnTimeOff = (member as { staff_time_off?: Array<{ start_date: string; end_date: string; status?: string | null }> })
          .staff_time_off?.some((timeOff) => {
            if (timeOff.status != null && timeOff.status !== "approved") return false;
            return date >= timeOff.start_date && date <= timeOff.end_date;
          });
        if (isOnTimeOff) continue;
      }

      if (dateYmd && segStartMin != null && segEndMin != null) {
        const resolved = await loadEffectiveStaffShifts(
          supabase,
          member.id,
          dateYmd,
          providerId,
          locationId ?? null,
        );
        const fits =
          resolved.workHoursEnabledEffective &&
          resolved.staffShifts.length > 0 &&
          segmentFitsAnyShift(segStartMin, segEndMin, resolved.staffShifts);
        if (!fits) continue;
      }

      if (date && startTime && endTime) {
        const staffBookings = existingBookingsMap[member.id] || [];
        const hasConflict = staffBookings.some((b: { booking?: { scheduled_at?: string } }) => {
          const bDate = b.booking?.scheduled_at?.split('T')[0];
          return bDate === date;
        });
        if (hasConflict) continue;
      }

      availableStaff.push(member);
    }

    const cleanedStaff = availableStaff.map((member) => {
      const { staff_time_off: _staff_time_off, ...rest } = member as Record<string, unknown>;
      return rest;
    });

    return successResponse({ data: cleanedStaff });
  } catch (error) {
    return handleApiError(error, "Failed to fetch available staff");
  }
}
