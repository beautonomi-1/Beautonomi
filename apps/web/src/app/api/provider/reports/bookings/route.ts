import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { createClient } from "@supabase/supabase-js";
import { differenceInCalendarDays } from "date-fns";
import { getDayInTz } from "@/lib/dates/provider-tz";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { getProviderNetAfterRefundsByBooking } from "@/lib/reports/revenue-helpers";
import { MAX_BOOKINGS_FOR_REPORT, MAX_REPORT_DAYS } from "@/lib/reports/constants";
import {
  CHANNEL_BASIS_NOTE,
  computeBookingChannelBreakdown,
} from "@/lib/reports/booking-channel-breakdown";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );    const sp = request.nextUrl.searchParams;
    const locationId = sp.get("location_id") || null;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const { fromDate, toDate } = reportDateRangeFromParams(sp, reportContext.timezone, { defaultDays: 30, maxDays: MAX_REPORT_DAYS });

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, status, scheduled_at, cancellation_reason, booking_source")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());
    if (locationId) bookingsQuery = bookingsQuery.eq("location_id", locationId);

    let exactCountQuery = supabaseAdmin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());
    if (locationId) exactCountQuery = exactCountQuery.eq("location_id", locationId);

    const [{ data: bookings, error: bookingsError }, { count: exactBookingCount }] = await Promise.all([
      bookingsQuery.order("scheduled_at", { ascending: false }).limit(MAX_BOOKINGS_FOR_REPORT),
      exactCountQuery,
    ]);

    if (bookingsError) {
      return handleApiError(new Error("Failed to fetch bookings"), "BOOKINGS_FETCH_ERROR", 500);
    }

    const all = bookings || [];
    const sampleSize = all.length;
    const total = exactBookingCount ?? sampleSize;
    const sampleTruncated = total > sampleSize;

    const statusCounts = new Map<string, number>();
    const dayOfWeekCounts = new Map<string, number>();
    const cancelReasons = new Map<string, number>();
    let completedCount = 0;
    let cancelledCount = 0;
    let noShowCount = 0;

    DAY_NAMES.forEach((d) => dayOfWeekCounts.set(d, 0));

    all.forEach((b: any) => {
      statusCounts.set(b.status, (statusCounts.get(b.status) ?? 0) + 1);
      const dayName = DAY_NAMES[getDayInTz(new Date(b.scheduled_at), reportContext.timezone)] ?? "Mon";
      dayOfWeekCounts.set(dayName, (dayOfWeekCounts.get(dayName) ?? 0) + 1);

      if (b.status === "completed") completedCount++;
      else if (b.status === "cancelled") {
        cancelledCount++;
        const reason = b.cancellation_reason || "No reason provided";
        cancelReasons.set(reason, (cancelReasons.get(reason) ?? 0) + 1);
      } else if (b.status === "no_show") noShowCount++;
    });

    const daysDiff = Math.max(1, differenceInCalendarDays(toDate, fromDate) + 1);

    const revenueByBooking = await getProviderNetAfterRefundsByBooking(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId || undefined,
    );

    const channel_breakdown = computeBookingChannelBreakdown({
      bookings: all,
      recognizedRevenueByBookingId: revenueByBooking,
    });

    return successResponse({
      total_bookings: total,
      sample_size: sampleSize,
      sample_truncated: sampleTruncated,
      by_status: Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count })),
      by_day_of_week: DAY_NAMES.map((day) => ({ day, count: dayOfWeekCounts.get(day) ?? 0 })),
      completion_rate: sampleSize > 0 ? (completedCount / sampleSize) * 100 : 0,
      cancellation_count: cancelledCount,
      no_show_count: noShowCount,
      avg_per_day: total / daysDiff,
      cancellation_reasons: Array.from(cancelReasons.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      channel_breakdown,
      channelBasisNote: CHANNEL_BASIS_NOTE,
      basisNote:
        "Counts use bookings.scheduled_at in the selected range." +
        (sampleTruncated
          ? ` Status/channel breakdowns are based on the most recent ${sampleSize} of ${total} appointments; total count is exact.`
          : "") +
        " Channel revenue uses recognized provider revenue net of refund clawbacks per booking (see channelBasisNote).",
      reportBasis: "Appointment date window; all statuses included unless filtered in detail reports.",
    });
  } catch (error) {
    console.error("Error in bookings report:", error);
    return handleApiError(error, "Failed to generate bookings report");
  }
}
