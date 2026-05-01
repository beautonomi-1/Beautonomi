import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, subMonths, subYears, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  dateRangeBoundsUtc,
  endOfWeekInTz,
  formatDateYmd,
  startOfWeekInTz,
} from "@/lib/dates/provider-tz";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateKey } from "@/lib/reports/provider-report-utils";

function trendBucketKey(ymd: string, granularity: string, tz: string): string {
  const anchor = new Date(`${ymd}T12:00:00.000Z`);
  switch (granularity) {
    case "day":
      return ymd;
    case "week":
      return formatDateYmd(startOfWeekInTz(anchor, tz, 1), tz);
    case "month":
      return ymd.slice(0, 7);
    case "year":
      return ymd.slice(0, 4);
    default:
      return ymd;
  }
}

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
    const period = searchParams.get("period") || "month"; // day, week, month, year
    const locationId = searchParams.get("location_id") || undefined;

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const todayYmd = formatDateYmd(new Date(), tz);
    const zNow = toZonedTime(new Date(), tz);

    let fromYmd: string;
    let toYmd: string;

    switch (period) {
      case "day":
        fromYmd = formatDateYmd(subDays(zNow, 30), tz);
        toYmd = todayYmd;
        break;
      case "week": {
        const anchorUtc = subDays(zNow, 12 * 7);
        fromYmd = formatDateYmd(startOfWeekInTz(anchorUtc, tz, 1), tz);
        toYmd = formatDateYmd(endOfWeekInTz(new Date(), tz, 1), tz);
        break;
      }
      case "month":
        fromYmd = formatDateYmd(startOfMonth(subMonths(zNow, 12)), tz);
        toYmd = formatDateYmd(endOfMonth(zNow), tz);
        break;
      case "year":
        fromYmd = formatDateYmd(startOfYear(subYears(zNow, 3)), tz);
        toYmd = formatDateYmd(endOfYear(zNow), tz);
        break;
      default:
        fromYmd = formatDateYmd(subDays(zNow, 30), tz);
        toYmd = todayYmd;
    }

    const range = dateRangeBoundsUtc(fromYmd, toYmd, tz);
    const fromDate = new Date(range.fromIso);
    const toDate = new Date(range.toIso);

    const { revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId ?? null,
      { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone: tz }
    );

    // Get bookings for counting
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .order("scheduled_at", { ascending: true });

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

    // Group by period using finance_transactions revenue
    const trendMap = new Map<string, { revenue: number; bookings: number }>();

    // Process revenue by date from finance_transactions
    revenueByDate.forEach((revenue, dateStr) => {
      const key = trendBucketKey(dateStr, period, tz);
      const existing = trendMap.get(key) || { revenue: 0, bookings: 0 };
      existing.revenue += revenue;
      trendMap.set(key, existing);
    });

    // Add booking counts
    bookings?.forEach((booking) => {
      const ymd = reportDateKey(new Date(booking.scheduled_at), tz);
      const key = trendBucketKey(ymd, period, tz);
      const existing = trendMap.get(key) || { revenue: 0, bookings: 0 };
      existing.bookings += 1;
      trendMap.set(key, existing);
    });

    const trends = Array.from(trendMap.entries())
      .map(([bucketPeriod, data]) => ({ period: bucketPeriod, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Calculate growth
    let revenueGrowth = 0;
    let bookingsGrowth = 0;
    if (trends.length >= 2) {
      const current = trends[trends.length - 1];
      const previous = trends[trends.length - 2];
      revenueGrowth = previous.revenue > 0
        ? ((current.revenue - previous.revenue) / previous.revenue) * 100
        : 0;
      bookingsGrowth = previous.bookings > 0
        ? ((current.bookings - previous.bookings) / previous.bookings) * 100
        : 0;
    }

    // Summary
    const totalRevenue = trends.reduce((sum, t) => sum + t.revenue, 0);
    const totalBookings = trends.reduce((sum, t) => sum + t.bookings, 0);
    const averageRevenue = trends.length > 0 ? totalRevenue / trends.length : 0;

    return successResponse({
      period,
      trends,
      totalRevenue,
      totalBookings,
      averageRevenue,
      revenueGrowth,
      bookingsGrowth,
      reportBasis:
        "Revenue trends use provider_earnings ledger rows by ledger date. Booking counts use non-cancelled scheduled bookings in the same calendar buckets.",
    });
  } catch (error) {
    return handleApiError(error, "REVENUE_TRENDS_ERROR", 500);
  }
}
