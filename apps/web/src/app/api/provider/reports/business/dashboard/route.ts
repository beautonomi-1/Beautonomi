import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { canAccessReport } from "@/lib/subscriptions/report-gating";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { startOfMonth, endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  dateRangeBoundsUtc,
  endOfWeekInTz,
  formatDateYmd,
  startOfWeekInTz,
} from "@/lib/dates/provider-tz";
import { getProviderRevenue, type ProviderRevenueResult } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";

function sumLedgerSplits(result: ProviderRevenueResult) {
  const ledgerFromBookings = Array.from(result.revenueByBooking.values()).reduce((s, v) => s + v, 0);
  const ledgerFromProductOrders = Array.from(result.revenueByProductOrder.values()).reduce((s, v) => s + v, 0);
  return { ledgerFromBookings, ledgerFromProductOrders };
}

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const accessCheck = await canAccessReport(user.id, "basic");
    if (!accessCheck.allowed) {
      return accessCheck.error!;
    }

    const providerId =
      user.role === "superadmin"
        ? request.nextUrl.searchParams.get("provider_id")
        : await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return handleApiError(new Error("Provider profile not found"), "NOT_FOUND", 404);
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

    const todayResult = await getProviderRevenue(supabaseAdmin, providerId, startOfToday, endOfToday, locationId, dashOpts);
    const weekResult = await getProviderRevenue(supabaseAdmin, providerId, weekStart, weekEnd, locationId, dashOpts);
    const monthResult = await getProviderRevenue(supabaseAdmin, providerId, monthStart, monthEnd, locationId, dashOpts);

    const todaySplits = sumLedgerSplits(todayResult);
    const weekSplits = sumLedgerSplits(weekResult);
    const monthSplits = sumLedgerSplits(monthResult);

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

    const todayBookingsCount = todayBookings?.length || 0;
    const todayCompleted = todayBookings?.filter((b) => b.status === "completed").length || 0;

    const weekBookingsCount = weekBookings?.length || 0;

    const monthBookingsCount = monthBookings?.length || 0;
    const monthClients = new Set(monthBookings?.map((b) => b.customer_id).filter(Boolean)).size;

    let upBq = supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at, status, total_amount")
      .eq("provider_id", providerId)
      .in("status", ["pending", "confirmed", "checked_in", "in_progress"])
      .gte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(10);
    if (locationId) upBq = upBq.eq("location_id", locationId);
    const { data: upcomingBookings } = await upBq;

    let recBq = supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at, status, total_amount")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .lte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(10);
    if (locationId) recBq = recBq.eq("location_id", locationId);
    const { data: recentBookings } = await recBq;

    const reportBasis =
      `Provider timezone ${tz}. ` +
      `Ledger headline revenue sums finance_transactions with transaction_type provider_earnings and created_at in each window (platform-settled earnings; excludes tips/travel rows). ` +
      `Cash or unsupported terminal paths may not produce ledger rows. ` +
      `Booking counts use bookings.scheduled_at and exclude cancelled and no_show only (includes pending, confirmed, completed, etc.). ` +
      `Month distinct clients = unique customer_id on those month bookings. ` +
      `Upcoming = next 10 bookings with status in pending/confirmed/checked_in/in_progress and scheduled_at ≥ now. ` +
      `Recent = last 10 past bookings (scheduled_at ≤ now) excluding cancelled/no_show. ` +
      `Listed booking amounts are booking.total_amount snapshots, not ledger totals.`;

    const basis = {
      ledgerHeadline:
        "Sum of net provider_earnings rows per window (finance_transactions.created_at). Product-order earnings included in headline.",
      bookingCounts:
        "scheduled_at inside window; statuses cancelled and no_show excluded from counts.",
      todayWindow: "Calendar day bounds in provider TZ.",
      weekWindow: "Monday–Sunday calendar week containing today (provider TZ).",
      monthWindow: "Full calendar month containing today (provider TZ).",
      upcomingList: "Soonest future appointments in qualifying statuses (max 10).",
      recentList: "Most recent past appointments excluding cancelled/no_show (max 10).",
      bookedAmountColumn: "booking.total_amount — informational; not ledger earnings.",
    };

    return successResponse({
      timezone: tz,
      windows: {
        today: { fromYmd: todayYmd, toYmd: todayYmd },
        week: { fromYmd: weekStartYmd, toYmd: weekEndYmd },
        month: { fromYmd: monthStartYmd, toYmd: monthEndYmd },
      },
      today: {
        revenue: todayResult.totalRevenue,
        ledgerFromBookings: todaySplits.ledgerFromBookings,
        ledgerFromProductOrders: todaySplits.ledgerFromProductOrders,
        bookings: todayBookingsCount,
        completed: todayCompleted,
      },
      week: {
        revenue: weekResult.totalRevenue,
        ledgerFromBookings: weekSplits.ledgerFromBookings,
        ledgerFromProductOrders: weekSplits.ledgerFromProductOrders,
        bookings: weekBookingsCount,
      },
      month: {
        revenue: monthResult.totalRevenue,
        ledgerFromBookings: monthSplits.ledgerFromBookings,
        ledgerFromProductOrders: monthSplits.ledgerFromProductOrders,
        bookings: monthBookingsCount,
        clients: monthClients,
      },
      upcomingBookings: upcomingBookings || [],
      recentBookings: recentBookings || [],
      reportBasis,
      basis,
      report_basis: reportBasis,
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_DASHBOARD_ERROR", 500);
  }
}
