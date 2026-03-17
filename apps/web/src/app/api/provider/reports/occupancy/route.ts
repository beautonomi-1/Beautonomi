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
    const fromDate = new Date(fromStr + "T00:00:00Z");
    const toDate = new Date(toStr + "T00:00:00Z");
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return errorResponse("Invalid date format. Use YYYY-MM-DD.", "VALIDATION_ERROR", 400);
    }
    if (fromDate > toDate) {
      return errorResponse("'from' must be before or equal to 'to'.", "VALIDATION_ERROR", 400);
    }
    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (daysDiff > MAX_DAYS) {
      return errorResponse(`Date range cannot exceed ${MAX_DAYS} days.`, "VALIDATION_ERROR", 400);
    }

    let staffQuery = supabaseAdmin
      .from("provider_staff")
      .select("id, user_id, users(full_name)")
      .eq("provider_id", providerId)
      .eq("is_active", true);
    if (staffIdFilter) staffQuery = staffQuery.eq("id", staffIdFilter);
    const { data: staffList, error: staffError } = await staffQuery;
    if (staffError) throw staffError;

    type StaffRow = { id: string; users?: { full_name?: string } | Array<{ full_name?: string }> };
    const staffRows = (staffList ?? []) as StaffRow[];
    const staffIds = staffRows.map((s) => s.id);
    const staffNames = new Map<string, string>();
    staffRows.forEach((s) => {
      const name = (Array.isArray(s.users) ? s.users[0]?.full_name : (s.users as { full_name?: string })?.full_name) ?? "Unassigned";
      staffNames.set(s.id, name);
    });

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

    const dates: string[] = [];
    for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    const dayOfWeek = (dateStr: string) => new Date(dateStr + "T12:00:00Z").getUTCDay();

    type TimeOffRow = { staff_id: string; start_date: string; end_date: string };
    type SchedRow = { staff_id: string; day_of_week: number; start_time?: string; end_time?: string; is_working?: boolean };
    const getAvailableMinutes = (sid: string, dateStr: string): number => {
      const off = (timeOff ?? []).find(
        (t: TimeOffRow) => t.staff_id === sid && dateStr >= t.start_date && dateStr <= t.end_date
      );
      if (off) return 0;
      const dow = dayOfWeek(dateStr);
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
      .gte("scheduled_at", fromStr + "T00:00:00Z")
      .lte("scheduled_at", toStr + "T23:59:59.999Z");

    if (bookError) throw bookError;

    type BookingRow = { id: string; scheduled_at?: string; location_id?: string };
    const bookingRows = (bookingsInRange ?? []) as BookingRow[];
    const bookingIds = bookingRows
      .filter((b) => !locationId || b.location_id === locationId)
      .map((b) => b.id);
    const bookingDateById = new Map<string, string>();
    bookingRows.forEach((b) => {
      if (b.scheduled_at) bookingDateById.set(b.id, b.scheduled_at.slice(0, 10));
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
        if (!dateStr || dateStr < fromStr || dateStr > toStr) continue;
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

    return successResponse({ byStaff, byDate });
  } catch (error) {
    return handleApiError(error, "Failed to generate occupancy report");
  }
}
