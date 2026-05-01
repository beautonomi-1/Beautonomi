import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subQuarters,
  subYears,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";

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
    const period = searchParams.get("period") || "month"; // month, quarter, year
    const locationId = searchParams.get("location_id") || undefined;

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const todayYmd = formatDateYmd(new Date(), tz);
    const zNow = toZonedTime(new Date(), tz);

    let currentFromDate: Date;
    let currentToDate: Date;
    let previousFromDate: Date;
    let previousToDate: Date;

    switch (period) {
      case "month": {
        const curFrom = formatDateYmd(startOfMonth(zNow), tz);
        const cur = dateRangeBoundsUtc(curFrom, todayYmd, tz);
        currentFromDate = new Date(cur.fromIso);
        currentToDate = new Date(cur.toIso);
        const prevMonth = subMonths(zNow, 1);
        const pFrom = formatDateYmd(startOfMonth(prevMonth), tz);
        const pTo = formatDateYmd(endOfMonth(prevMonth), tz);
        const prev = dateRangeBoundsUtc(pFrom, pTo, tz);
        previousFromDate = new Date(prev.fromIso);
        previousToDate = new Date(prev.toIso);
        break;
      }
      case "quarter": {
        const curFrom = formatDateYmd(startOfQuarter(zNow), tz);
        const cur = dateRangeBoundsUtc(curFrom, todayYmd, tz);
        currentFromDate = new Date(cur.fromIso);
        currentToDate = new Date(cur.toIso);
        const prevQ = subQuarters(zNow, 1);
        const pFrom = formatDateYmd(startOfQuarter(prevQ), tz);
        const pTo = formatDateYmd(endOfQuarter(prevQ), tz);
        const prev = dateRangeBoundsUtc(pFrom, pTo, tz);
        previousFromDate = new Date(prev.fromIso);
        previousToDate = new Date(prev.toIso);
        break;
      }
      case "year": {
        const curFrom = formatDateYmd(startOfYear(zNow), tz);
        const cur = dateRangeBoundsUtc(curFrom, todayYmd, tz);
        currentFromDate = new Date(cur.fromIso);
        currentToDate = new Date(cur.toIso);
        const prevY = subYears(zNow, 1);
        const pFrom = formatDateYmd(startOfYear(prevY), tz);
        const pTo = formatDateYmd(endOfYear(prevY), tz);
        const prev = dateRangeBoundsUtc(pFrom, pTo, tz);
        previousFromDate = new Date(prev.fromIso);
        previousToDate = new Date(prev.toIso);
        break;
      }
      default: {
        const curFrom = formatDateYmd(subMonths(zNow, 1), tz);
        const cur = dateRangeBoundsUtc(curFrom, todayYmd, tz);
        currentFromDate = new Date(cur.fromIso);
        currentToDate = new Date(cur.toIso);
        const pFrom = formatDateYmd(subMonths(zNow, 2), tz);
        const pTo = formatDateYmd(subMonths(zNow, 1), tz);
        const prev = dateRangeBoundsUtc(pFrom, pTo, tz);
        previousFromDate = new Date(prev.fromIso);
        previousToDate = new Date(prev.toIso);
        break;
      }
    }

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone: tz };

    const { totalRevenue: currentRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      currentFromDate,
      currentToDate,
      locationId ?? null,
      dashOpts
    );

    const { totalRevenue: previousRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      previousFromDate,
      previousToDate,
      locationId ?? null,
      dashOpts
    );

    // Get current period bookings (for counts and status)
    let currentBookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, status, customer_id, scheduled_at")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", currentFromDate.toISOString())
      .lte("scheduled_at", currentToDate.toISOString());

    if (locationId) {
      currentBookingsQuery = currentBookingsQuery.eq("location_id", locationId);
    }

    const { data: currentBookings } = await currentBookingsQuery;

    // Get previous period bookings (for counts and status)
    let previousBookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, status, customer_id, scheduled_at")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", previousFromDate.toISOString())
      .lte("scheduled_at", previousToDate.toISOString());

    if (locationId) {
      previousBookingsQuery = previousBookingsQuery.eq("location_id", locationId);
    }

    const { data: previousBookings } = await previousBookingsQuery;

    // Calculate current period metrics
    const currentBookingsCount = currentBookings?.length || 0;
    const currentCompleted = currentBookings?.filter((b) => b.status === "completed").length || 0;
    const currentClients = new Set(currentBookings?.map((b) => b.customer_id).filter(Boolean)).size;
    const currentAverageValue = currentBookingsCount > 0 ? currentRevenue / currentBookingsCount : 0;

    // Calculate previous period metrics
    const previousBookingsCount = previousBookings?.length || 0;
    const previousCompleted = previousBookings?.filter((b) => b.status === "completed").length || 0;
    const previousClients = new Set(previousBookings?.map((b) => b.customer_id).filter(Boolean)).size;
    const previousAverageValue = previousBookingsCount > 0 ? previousRevenue / previousBookingsCount : 0;

    // Calculate growth
    const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const bookingsGrowth = previousBookingsCount > 0 ? ((currentBookingsCount - previousBookingsCount) / previousBookingsCount) * 100 : 0;
    const clientsGrowth = previousClients > 0 ? ((currentClients - previousClients) / previousClients) * 100 : 0;

    return successResponse({
      period,
      current: {
        revenue: currentRevenue,
        bookings: currentBookingsCount,
        completed: currentCompleted,
        clients: currentClients,
        averageValue: currentAverageValue,
      },
      previous: {
        revenue: previousRevenue,
        bookings: previousBookingsCount,
        completed: previousCompleted,
        clients: previousClients,
        averageValue: previousAverageValue,
      },
      growth: {
        revenue: revenueGrowth,
        bookings: bookingsGrowth,
        clients: clientsGrowth,
      },
      reportBasis:
        "Comparison revenue uses provider_earnings ledger rows. Booking and client counts exclude cancelled/no-show bookings in each calendar period.",
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_COMPARISON_ERROR", 500);
  }
}
