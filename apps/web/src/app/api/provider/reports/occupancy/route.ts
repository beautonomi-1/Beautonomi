import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { dateRangeBoundsUtc, getDayInTz } from "@/lib/dates/provider-tz";
import { eachReportDateKey, getProviderReportContext, reportDateKey } from "@/lib/reports/provider-report-utils";

const MAX_DAYS = 31;

function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface OccupancyDayRow {
  date: string;
  availableMinutes: number;
  bookedMinutes: number;
  occupancyPercent: number;
}

export interface OccupancyStaffRow {
  staffId: string;
  staffName: string;
  byDate: OccupancyDayRow[];
}

export interface OccupancyResponse {
  byStaff: OccupancyStaffRow[];
  byDate: Array<{ date: string; totalAvailable: number; totalBooked: number; occupancyPercent: number }>;
}

/**
 * GET /api/provider/reports/occupancy
 * Query: from (YYYY-MM-DD), to (YYYY-MM-DD), location_id (optional), staff_id (optional).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const locationId = searchParams.get("location_id") || undefined;
    const staffIdFilter = searchParams.get("staff_id") || undefined;

    if (!fromStr || !toStr) {
      return errorResponse("Query parameters 'from' and 'to' (YYYY-MM-DD) are required", "VALIDATION_ERROR", 400);
    }
    const fromYmd = fromStr.slice(0, 10);
    const toYmd = toStr.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) {
      return errorResponse("Invalid date format. Use YYYY-MM-DD.", "VALIDATION_ERROR", 400);
    }
    if (fromYmd > toYmd) {
      return errorResponse("'from' must be before or equal to 'to'.", "VALIDATION_ERROR", 400);
    }

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;

    const dates = eachReportDateKey(fromYmd, toYmd);
    if (dates.length > MAX_DAYS) {
      return errorResponse(`Date range cannot exceed ${MAX_DAYS} days.`, "VALIDATION_ERROR", 400);
    }

    const { fromIso, toIso } = dateRangeBoundsUtc(fromYmd, toYmd, tz);

    let staffQuery = supabaseAdmin
      .from("provider_staff")
      .select("id, user_id, users(full_name)")
      .eq("provider_id", providerId)
      .eq("is_active", true);
    if (staffIdFilter) staffQuery = staffQuery.eq("id", staffIdFilter);
    const { data: staffList, error: staffError } = await staffQuery;
    if (staffError) throw staffError;

    type StaffRow = { id: string; users?: { full_name?: string } | Array<{ full_name?: string }> };
    let staffRows = (staffList ?? []) as StaffRow[];
    let staffIds = staffRows.map((s) => s.id);
    if (locationId && staffIds.length > 0) {
      const { data: assignments, error: assignmentError } = await supabaseAdmin
        .from("provider_staff_locations")
        .select("staff_id")
        .eq("location_id", locationId)
        .in("staff_id", staffIds);
      if (assignmentError) throw assignmentError;
      const assignedStaffIds = new Set((assignments ?? []).map((a: { staff_id: string }) => a.staff_id));
      // Legacy tenants may not have assignment rows; in that case preserve provider-wide staff.
      if (assignedStaffIds.size > 0) {
        staffRows = staffRows.filter((s) => assignedStaffIds.has(s.id));
        staffIds = staffRows.map((s) => s.id);
      }
    }
    const staffNames = new Map<string, string>();
    staffRows.forEach((s) => {
      const name = (Array.isArray(s.users) ? s.users[0]?.full_name : (s.users as { full_name?: string })?.full_name) ?? "Unassigned";
      staffNames.set(s.id, name);
    });

    if (staffIds.length === 0) {
      return successResponse({
        byStaff: [],
        byDate: dates.map((date) => ({ date, totalAvailable: 0, totalBooked: 0, occupancyPercent: 0 })),
        reportBasis:
          "Occupancy compares assigned active staff schedule minutes against booked service minutes for non-cancelled appointments.",
      });
    }

    const { data: schedules, error: schedError } = await supabaseAdmin
      .from("staff_schedules")
      .select("staff_id, day_of_week, start_time, end_time, is_working")
      .in("staff_id", staffIds);

    if (schedError) throw schedError;

    const { data: timeOff, error: toError } = await supabaseAdmin
      .from("staff_time_off")
      .select("staff_id, start_date, end_date")
      .in("staff_id", staffIds);

    if (toError) throw toError;

    const dayOfWeekInTz = (dateStr: string) => {
      const { fromIso } = dateRangeBoundsUtc(dateStr, dateStr, tz);
      return getDayInTz(new Date(fromIso), tz);
    };

    type TimeOffRow = { staff_id: string; start_date: string; end_date: string };
    type SchedRow = { staff_id: string; day_of_week: number; start_time?: string; end_time?: string; is_working?: boolean };
    const getAvailableMinutes = (sid: string, dateStr: string): number => {
      const off = (timeOff ?? []).find(
        (t: TimeOffRow) => t.staff_id === sid && dateStr >= t.start_date && dateStr <= t.end_date
      );
      if (off) return 0;
      const dow = dayOfWeekInTz(dateStr);
      const sched = (schedules ?? []).find(
        (s: SchedRow) => s.staff_id === sid && s.day_of_week === dow && s.is_working
      );
      if (!sched || !sched.start_time || !sched.end_time) return 0;
      const start = timeToMinutes(sched.start_time);
      const end = timeToMinutes(sched.end_time);
      return Math.max(0, end - start);
    };

    const { data: bookingsInRange, error: bookError } = await supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at, location_id")
      .eq("provider_id", providerId)
      .in("status", ["confirmed", "checked_in", "in_progress", "completed"])
      .gte("scheduled_at", fromIso)
      .lte("scheduled_at", toIso);

    if (bookError) throw bookError;

    type BookingRow = { id: string; scheduled_at?: string; location_id?: string };
    const bookingRows = (bookingsInRange ?? []) as BookingRow[];
    const bookingIds = bookingRows
      .filter((b) => !locationId || b.location_id === locationId)
      .map((b) => b.id);
    const bookingDateById = new Map<string, string>();
    bookingRows.forEach((b) => {
      if (b.scheduled_at) bookingDateById.set(b.id, reportDateKey(new Date(b.scheduled_at), tz));
    });

    const bookedByStaffDate = new Map<string, number>();
    if (bookingIds.length > 0) {
      const { data: services, error: bsError } = await supabaseAdmin
        .from("booking_services")
        .select("booking_id, staff_id, duration_minutes")
        .in("booking_id", bookingIds);
      if (bsError) throw bsError;
      type BookingServiceRow = { booking_id: string; staff_id?: string; duration_minutes?: number };
      for (const bs of (services ?? []) as BookingServiceRow[]) {
        const sid = bs.staff_id;
        if (!sid) continue;
        const dateStr = bookingDateById.get(bs.booking_id);
        if (!dateStr || dateStr < fromYmd || dateStr > toYmd) continue;
        const key = `${sid}:${dateStr}`;
        const mins = bs.duration_minutes ?? 0;
        bookedByStaffDate.set(key, (bookedByStaffDate.get(key) || 0) + mins);
      }
    }

    const byStaff: OccupancyStaffRow[] = staffIds.map((sid) => ({
      staffId: sid,
      staffName: staffNames.get(sid) || "Unknown",
      byDate: dates.map((dateStr) => {
        const available = getAvailableMinutes(sid, dateStr);
        const booked = bookedByStaffDate.get(`${sid}:${dateStr}`) || 0;
        const occupancyPercent = available > 0 ? Math.round((booked / available) * 100) : 0;
        return { date: dateStr, availableMinutes: available, bookedMinutes: booked, occupancyPercent };
      }),
    }));

    const byDate = dates.map((dateStr) => {
      let totalAvailable = 0;
      let totalBooked = 0;
      byStaff.forEach((row) => {
        const day = row.byDate.find((d) => d.date === dateStr);
        if (day) {
          totalAvailable += day.availableMinutes;
          totalBooked += day.bookedMinutes;
        }
      });
      const occupancyPercent = totalAvailable > 0 ? Math.round((totalBooked / totalAvailable) * 100) : 0;
      return { date: dateStr, totalAvailable, totalBooked, occupancyPercent };
    });

    return successResponse({
      byStaff,
      byDate,
      reportBasis:
        "Occupancy compares assigned active staff schedule minutes against booked service minutes for confirmed, checked-in, in-progress, and completed appointments.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate occupancy report");
  }
}
