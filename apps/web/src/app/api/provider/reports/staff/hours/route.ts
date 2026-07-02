import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const staffId = searchParams.get("staff_id");
    const locationId = searchParams.get("location_id") || undefined;

    // Get staff members
    let staffQuery = supabaseAdmin
      .from("provider_staff")
      .select(
        `
        id,
        user_id,
        users (
          full_name
        )
      `
      )
      .eq("provider_id", providerId)
      .eq("is_active", true);

    if (staffId) {
      staffQuery = staffQuery.eq("id", staffId);
    }

    const { data: staffMembers, error: staffError } = await staffQuery;

    if (staffError) {
      return handleApiError(
        new Error("Failed to fetch staff"),
        "STAFF_FETCH_ERROR",
        500
      );
    }

    // Get bookings with actual start/end times
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        scheduled_at,
        status,
        booking_services (
          id,
          staff_id,
          actual_start_at,
          actual_end_at,
          offerings:offering_id (
            duration_minutes
          )
        )
      `
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Calculate hours for each staff member
    const hoursData = (staffMembers || []).map((staff) => {
      const staffBookings = bookings?.filter((booking) =>
        booking.booking_services?.some((bs: any) => bs.staff_id === staff.id)
      ) || [];

      let totalHours = 0;
      let scheduledHours = 0;
      // completedBookingIds: distinct bookings where this staff has at least one
      // service line with actual start/end recorded — used for attendance rate.
      const completedBookingIds = new Set<string>();
      let onTimeBookings = 0;

      staffBookings.forEach((booking: any) => {
        let bookingHasActual = false;
        booking.booking_services?.forEach((bs: any) => {
          if (bs.staff_id !== staff.id) return;
          const duration = bs.offerings?.duration_minutes || 0;
          scheduledHours += duration / 60;

          if (bs.actual_start_at && bs.actual_end_at) {
            const start = new Date(bs.actual_start_at);
            const end = new Date(bs.actual_end_at);
            totalHours += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
            bookingHasActual = true;

            // On time = started within 15 minutes of booking.scheduled_at
            const scheduled = new Date(booking.scheduled_at);
            const diff = Math.abs(start.getTime() - scheduled.getTime()) / (1000 * 60);
            if (diff <= 15) {
              onTimeBookings += 1;
            }
          }
        });
        if (bookingHasActual) completedBookingIds.add(booking.id);
      });

      const completedBookings = completedBookingIds.size;
      const periodDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const averageHoursPerDay = totalHours > 0 ? totalHours / periodDays : 0;

      return {
        staffId: staff.id,
        staffName: (staff.users as any)?.full_name || "Unknown",
        totalHours,
        scheduledHours,
        completedBookings,
        onTimeBookings,
        averageHoursPerDay,
        // attendanceRate: share of assigned bookings that had actual times recorded
        attendanceRate: staffBookings.length > 0
          ? (completedBookings / staffBookings.length) * 100
          : 0,
        onTimeRate: completedBookings > 0
          ? (onTimeBookings / completedBookings) * 100
          : 0,
      };
    }).sort((a, b) => b.totalHours - a.totalHours);

    // Summary
    const totalHours = hoursData.reduce((sum, s) => sum + s.totalHours, 0);
    const totalScheduledHours = hoursData.reduce((sum, s) => sum + s.scheduledHours, 0);
    const averageHoursPerStaff = hoursData.length > 0 ? totalHours / hoursData.length : 0;

    return successResponse({
      totalHours,
      totalScheduledHours,
      averageHoursPerStaff,
      staffHours: hoursData,
    });
  } catch (error) {
    return handleApiError(error, "STAFF_HOURS_ERROR", 500);
  }
}
