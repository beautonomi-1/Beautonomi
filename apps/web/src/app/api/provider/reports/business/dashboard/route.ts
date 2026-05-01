import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { canAccessReport } from "@/lib/subscriptions/report-gating";
import { createClient } from "@supabase/supabase-js";
import { startOfMonth, endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  dateRangeBoundsUtc,
  endOfWeekInTz,
  formatDateYmd,
  startOfWeekInTz,
} from "@/lib/dates/provider-tz";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    // Check subscription allows basic reports
    const accessCheck = await canAccessReport(user.id, "basic");
    if (!accessCheck.allowed) {
      return accessCheck.error!;
    }

    const providerId = user.role === 'superadmin'
      ? request.nextUrl.searchParams.get('provider_id')
      : await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }

    const locationId = request.nextUrl.searchParams.get("location_id") || null;

    const now = new Date();
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const todayYmd = formatDateYmd(now, tz);
    const zNow = toZonedTime(now, tz);

    const todayBounds = dateRangeBoundsUtc(todayYmd, todayYmd, tz);
    const startOfToday = new Date(todayBounds.fromIso);
    const endOfToday = new Date(todayBounds.toIso);

    const weekStartYmd = formatDateYmd(startOfWeekInTz(now, tz, 1), tz);
    const weekEndYmd = formatDateYmd(endOfWeekInTz(now, tz, 1), tz);
    const weekBounds = dateRangeBoundsUtc(weekStartYmd, weekEndYmd, tz);
    const weekStart = new Date(weekBounds.fromIso);
    const weekEnd = new Date(weekBounds.toIso);

    const monthStartYmd = formatDateYmd(startOfMonth(zNow), tz);
    const monthEndYmd = formatDateYmd(endOfMonth(zNow), tz);
    const monthBounds = dateRangeBoundsUtc(monthStartYmd, monthEndYmd, tz);
    const monthStart = new Date(monthBounds.fromIso);
    const monthEnd = new Date(monthBounds.toIso);

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone: tz };

    const { totalRevenue: todayRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      startOfToday,
      endOfToday,
      locationId,
      dashOpts
    );

    const { totalRevenue: weekRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      weekStart,
      weekEnd,
      locationId,
      dashOpts
    );

    const { totalRevenue: monthRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      monthStart,
      monthEnd,
      locationId,
      dashOpts
    );

    // Get bookings for different periods (for counts and status)
    let todayBq = supabaseAdmin
      .from("bookings")
      .select("id, status, scheduled_at")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", startOfToday.toISOString())
      .lte("scheduled_at", endOfToday.toISOString());
    if (locationId) todayBq = todayBq.eq("location_id", locationId);
    const { data: todayBookings } = await todayBq;

    let weekBq = supabaseAdmin
      .from("bookings")
      .select("id, status, scheduled_at")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", weekStart.toISOString())
      .lte("scheduled_at", weekEnd.toISOString());
    if (locationId) weekBq = weekBq.eq("location_id", locationId);
    const { data: weekBookings } = await weekBq;

    let monthBq = supabaseAdmin
      .from("bookings")
      .select("id, status, scheduled_at, customer_id")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", monthStart.toISOString())
      .lte("scheduled_at", monthEnd.toISOString());
    if (locationId) monthBq = monthBq.eq("location_id", locationId);
    const { data: monthBookings } = await monthBq;

    // Calculate today's metrics
    const todayBookingsCount = todayBookings?.length || 0;
    const todayCompleted = todayBookings?.filter((b) => b.status === "completed").length || 0;

    // Calculate week's metrics
    const weekBookingsCount = weekBookings?.length || 0;

    // Calculate month's metrics
    const monthBookingsCount = monthBookings?.length || 0;
    const monthClients = new Set(monthBookings?.map((b) => b.customer_id).filter(Boolean)).size;

    // Get upcoming bookings
    let upBq = supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at, status")
      .eq("provider_id", providerId)
      .in("status", ["pending", "confirmed", "checked_in", "in_progress"])
      .gte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(10);
    if (locationId) upBq = upBq.eq("location_id", locationId);
    const { data: upcomingBookings } = await upBq;

    // Get recent bookings
    let recBq = supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at, status")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .lte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(10);
    if (locationId) recBq = recBq.eq("location_id", locationId);
    const { data: recentBookings } = await recBq;

    return successResponse({
      today: {
        revenue: todayRevenue,
        bookings: todayBookingsCount,
        completed: todayCompleted,
      },
      week: {
        revenue: weekRevenue,
        bookings: weekBookingsCount,
      },
      month: {
        revenue: monthRevenue,
        bookings: monthBookingsCount,
        clients: monthClients,
      },
      upcomingBookings: upcomingBookings || [],
      recentBookings: recentBookings || [],
      reportBasis:
        "Dashboard revenue uses provider_earnings ledger rows. Booking/client counts exclude cancelled and no-show bookings.",
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_DASHBOARD_ERROR", 500);
  }
}
