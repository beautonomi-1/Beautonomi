import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
import {
  getProviderNetAfterRefundsDetailed,
  getProviderRevenue,
} from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";

function sumMapValues(m: Map<string, number>): number {
  return Array.from(m.values()).reduce((s, v) => s + v, 0);
}

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const periodParam = searchParams.get("period") || "month";
    const period = ["month", "quarter", "year"].includes(periodParam) ? periodParam : "month";
    const locationId = searchParams.get("location_id") || undefined;

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const todayYmd = formatDateYmd(new Date(), tz);
    const zNow = toZonedTime(new Date(), tz);

    let currentFromDate: Date;
    let currentToDate: Date;
    let previousFromDate: Date;
    let previousToDate: Date;
    let currentLabel = "";
    let previousLabel = "";

    switch (period) {
      case "month": {
        const curFrom = formatDateYmd(startOfMonth(zNow), tz);
        const cur = dateRangeBoundsUtc(curFrom, todayYmd, tz);
        currentFromDate = new Date(cur.fromIso);
        currentToDate = new Date(cur.toIso);
        currentLabel = "Month to date (this calendar month through today)";
        const prevMonth = subMonths(zNow, 1);
        const pFrom = formatDateYmd(startOfMonth(prevMonth), tz);
        const pTo = formatDateYmd(endOfMonth(prevMonth), tz);
        const prev = dateRangeBoundsUtc(pFrom, pTo, tz);
        previousFromDate = new Date(prev.fromIso);
        previousToDate = new Date(prev.toIso);
        previousLabel = "Full prior calendar month";
        break;
      }
      case "quarter": {
        const curFrom = formatDateYmd(startOfQuarter(zNow), tz);
        const cur = dateRangeBoundsUtc(curFrom, todayYmd, tz);
        currentFromDate = new Date(cur.fromIso);
        currentToDate = new Date(cur.toIso);
        currentLabel = "Quarter to date (this calendar quarter through today)";
        const prevQ = subQuarters(zNow, 1);
        const pFrom = formatDateYmd(startOfQuarter(prevQ), tz);
        const pTo = formatDateYmd(endOfQuarter(prevQ), tz);
        const prev = dateRangeBoundsUtc(pFrom, pTo, tz);
        previousFromDate = new Date(prev.fromIso);
        previousToDate = new Date(prev.toIso);
        previousLabel = "Full prior calendar quarter";
        break;
      }
      case "year": {
        const curFrom = formatDateYmd(startOfYear(zNow), tz);
        const cur = dateRangeBoundsUtc(curFrom, todayYmd, tz);
        currentFromDate = new Date(cur.fromIso);
        currentToDate = new Date(cur.toIso);
        currentLabel = "Year to date (this calendar year through today)";
        const prevY = subYears(zNow, 1);
        const pFrom = formatDateYmd(startOfYear(prevY), tz);
        const pTo = formatDateYmd(endOfYear(prevY), tz);
        const prev = dateRangeBoundsUtc(pFrom, pTo, tz);
        previousFromDate = new Date(prev.fromIso);
        previousToDate = new Date(prev.toIso);
        previousLabel = "Full prior calendar year";
        break;
      }
      default: {
        const curFrom = formatDateYmd(startOfMonth(zNow), tz);
        const cur = dateRangeBoundsUtc(curFrom, todayYmd, tz);
        currentFromDate = new Date(cur.fromIso);
        currentToDate = new Date(cur.toIso);
        currentLabel = "Month to date";
        const prevMonth = subMonths(zNow, 1);
        const pFrom = formatDateYmd(startOfMonth(prevMonth), tz);
        const pTo = formatDateYmd(endOfMonth(prevMonth), tz);
        const prev = dateRangeBoundsUtc(pFrom, pTo, tz);
        previousFromDate = new Date(prev.fromIso);
        previousToDate = new Date(prev.toIso);
        previousLabel = "Full prior calendar month";
      }
    }

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone: tz };
    const netOpts = { timezone: tz };

    const [currentRev, previousRev, currentService, previousService] = await Promise.all([
      getProviderNetAfterRefundsDetailed(
        supabaseAdmin,
        providerId,
        currentFromDate,
        currentToDate,
        locationId ?? null,
        netOpts,
      ),
      getProviderNetAfterRefundsDetailed(
        supabaseAdmin,
        providerId,
        previousFromDate,
        previousToDate,
        locationId ?? null,
        netOpts,
      ),
      getProviderRevenue(
        supabaseAdmin,
        providerId,
        currentFromDate,
        currentToDate,
        locationId ?? null,
        dashOpts,
      ),
      getProviderRevenue(
        supabaseAdmin,
        providerId,
        previousFromDate,
        previousToDate,
        locationId ?? null,
        dashOpts,
      ),
    ]);

    const currentRevenue = currentRev.totalRevenue;
    const previousRevenue = previousRev.totalRevenue;
    const currentLedgerBookings = sumMapValues(currentRev.revenueByBooking);
    const currentLedgerOrders = sumMapValues(currentRev.revenueByProductOrder);
    const previousLedgerBookings = sumMapValues(previousRev.revenueByBooking);
    const previousLedgerOrders = sumMapValues(previousRev.revenueByProductOrder);

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

    const currentBookingsCount = currentBookings?.length || 0;
    const currentCompleted = currentBookings?.filter((b) => b.status === "completed").length || 0;
    const currentClients = new Set(currentBookings?.map((b) => b.customer_id).filter(Boolean)).size;

    const previousBookingsCount = previousBookings?.length || 0;
    const previousCompleted = previousBookings?.filter((b) => b.status === "completed").length || 0;
    const previousClients = new Set(previousBookings?.map((b) => b.customer_id).filter(Boolean)).size;

    /** Booking-linked ledger only ÷ scheduled appointment count (excl. cancelled/no-show). */
    const averageLedgerPerScheduledBooking = (count: number, ledgerBookings: number) =>
      count > 0 ? ledgerBookings / count : 0;

    const currentAvg = averageLedgerPerScheduledBooking(currentBookingsCount, currentLedgerBookings);
    const previousAvg = averageLedgerPerScheduledBooking(previousBookingsCount, previousLedgerBookings);

    const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const bookingsGrowth =
      previousBookingsCount > 0 ? ((currentBookingsCount - previousBookingsCount) / previousBookingsCount) * 100 : 0;
    const clientsGrowth =
      previousClients > 0 ? ((currentClients - previousClients) / previousClients) * 100 : 0;
    const averageLedgerGrowth =
      previousAvg > 0 ? ((currentAvg - previousAvg) / previousAvg) * 100 : 0;

    const curFromYmd = formatDateYmd(currentFromDate, tz);
    const curToYmd = formatDateYmd(currentToDate, tz);
    const prevFromYmd = formatDateYmd(previousFromDate, tz);
    const prevToYmd = formatDateYmd(previousToDate, tz);

    const reportBasis =
      `Timezone ${tz}. ` +
      `Current column: ${currentLabel.toLowerCase()} — ${curFromYmd} through ${curToYmd}. ` +
      `Previous column: ${previousLabel.toLowerCase()} — ${prevFromYmd} through ${prevToYmd}. ` +
      `Until the period ends, current and previous ranges differ in length (period-to-date vs a complete prior calendar period). ` +
      `Headline revenue = recognized provider revenue net of refund clawbacks by finance_transactions.created_at. ` +
      `service_earnings sub-line = provider_earnings only. ` +
      `Booking-linked ledger split is used for “avg per booking”. ` +
      `Scheduled booking counts use bookings.scheduled_at and exclude cancelled and no_show. ` +
      `Distinct clients = unique customer_id on those bookings.`;

    const basis = {
      currentWindow: currentLabel,
      previousWindow: previousLabel,
      ledgerHeadline:
        "Recognized provider revenue net of refund clawbacks (settlement timestamp created_at).",
      serviceEarnings:
        "provider_earnings only — used for avg-per-booking splits, not headline revenue.",
      averagePerBooking:
        "Ledger attributed to bookings ÷ count of scheduled appointments (non-cancelled/no-show). Not booking.total_amount.",
      bookings:
        "scheduled_at within each window; statuses cancelled and no_show excluded.",
      growth:
        "Percent change when prior value > 0; otherwise 0 (avoid misleading lifts from a zero baseline).",
    };

    return successResponse({
      timezone: tz,
      period,
      windows: {
        current: { fromYmd: curFromYmd, toYmd: curToYmd, description: currentLabel },
        previous: { fromYmd: prevFromYmd, toYmd: prevToYmd, description: previousLabel },
      },
      current: {
        revenue: currentRevenue,
        recognized_revenue_net: currentRevenue,
        service_earnings: currentService.totalRevenue,
        ledgerFromBookings: currentLedgerBookings,
        ledgerFromProductOrders: currentLedgerOrders,
        bookings: currentBookingsCount,
        completed: currentCompleted,
        clients: currentClients,
        averageLedgerPerScheduledBooking: currentAvg,
        averageValue: currentAvg,
      },
      previous: {
        revenue: previousRevenue,
        recognized_revenue_net: previousRevenue,
        service_earnings: previousService.totalRevenue,
        ledgerFromBookings: previousLedgerBookings,
        ledgerFromProductOrders: previousLedgerOrders,
        bookings: previousBookingsCount,
        completed: previousCompleted,
        clients: previousClients,
        averageLedgerPerScheduledBooking: previousAvg,
        averageValue: previousAvg,
      },
      growth: {
        revenue: revenueGrowth,
        bookings: bookingsGrowth,
        clients: clientsGrowth,
        averageLedgerPerScheduledBooking: averageLedgerGrowth,
      },
      reportBasis,
      basis,
      report_basis: reportBasis,
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_COMPARISON_ERROR", 500);
  }
}