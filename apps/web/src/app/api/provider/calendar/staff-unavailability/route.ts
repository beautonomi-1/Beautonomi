import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  buildStaffUnavailabilityDisplay,
  type StaffDayOffRow,
  type StaffTimeOffRow,
} from "@/lib/calendar/build-staff-unavailability-display";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/provider/calendar/staff-unavailability
 * Query: date_from, date_to (YYYY-MM-DD)
 *
 * Returns AvailabilityBlockDisplay-shaped segments for staff_time_off + staff_days_off
 * (same sources the public booking availability route uses for blocking slots).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("date_from")?.trim() ?? "";
    const dateTo = searchParams.get("date_to")?.trim() ?? "";

    if (!YMD.test(dateFrom) || !YMD.test(dateTo)) {
      return handleApiError(
        new Error("date_from and date_to are required (YYYY-MM-DD)"),
        "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }

    const { data: timeOffRaw, error: timeOffError } = await supabase
      .from("staff_time_off")
      .select("id, staff_id, start_date, end_date, reason, type, status")
      .eq("provider_id", providerId)
      .lte("start_date", dateTo)
      .gte("end_date", dateFrom);

    if (timeOffError && timeOffError.code !== "42P01") {
      throw timeOffError;
    }

    const { data: daysOffRaw, error: daysOffError } = await supabase
      .from("staff_days_off")
      .select("id, staff_id, date, reason, is_approved")
      .eq("provider_id", providerId)
      .gte("date", dateFrom)
      .lte("date", dateTo);

    if (daysOffError && daysOffError.code !== "42P01") {
      throw daysOffError;
    }

    const display = buildStaffUnavailabilityDisplay(
      dateFrom,
      dateTo,
      (timeOffRaw ?? []) as StaffTimeOffRow[],
      (daysOffRaw ?? []) as StaffDayOffRow[],
    );

    return successResponse(display);
  } catch (error) {
    return handleApiError(error, "Failed to fetch staff unavailability");
  }
}
