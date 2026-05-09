import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { startOfWeek, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { formatDateYmd, dateRangeBoundsUtc } from "@/lib/dates/provider-tz";
import {
  filterLedgerRowsForLocation,
  getProviderReportContext,
  type LedgerLocationAttributionSummary,
  summarizeLedgerLocationAttribution,
} from "@/lib/reports/provider-report-utils";
import { getProviderRevenue, getPreviousPeriodRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const locationId = searchParams.get("location_id");
    const period = searchParams.get("period") || "month"; // week, month, quarter, year

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const timezone = reportContext.timezone;
    const todayYmd = formatDateYmd(new Date(), timezone);
    const zNow = toZonedTime(new Date(), timezone);

    let fromYmd: string;
    switch (period) {
      case "week":
        fromYmd = formatDateYmd(startOfWeek(zNow, { weekStartsOn: 1 }), timezone);
        break;
      case "month":
        fromYmd = formatDateYmd(startOfMonth(zNow), timezone);
        break;
      case "quarter":
        fromYmd = formatDateYmd(startOfQuarter(zNow), timezone);
        break;
      case "year":
        fromYmd = formatDateYmd(startOfYear(zNow), timezone);
        break;
      default:
        fromYmd = formatDateYmd(startOfMonth(zNow), timezone);
    }

    const { fromIso, toIso } = dateRangeBoundsUtc(fromYmd, todayYmd, timezone);
    const fromDate = new Date(fromIso);
    const toDate = new Date(toIso);

    // Get bookings
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, total_amount, scheduled_at, status, customer_id, location_id")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());
    
    // Filter by location if provided
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

    // Get staff
    const { data: staff } = await supabaseAdmin
      .from("provider_staff")
      .select("id")
      .eq("provider_id", providerId);

    const bookingIds = bookings?.map((b) => b.id) || [];
    const { data: refundAll } = await supabaseAdmin
      .from("finance_transactions")
      .select("amount, booking_id, product_order_id")
      .eq("provider_id", providerId)
      .eq("transaction_type", "refund")
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());
    type RefundRow = { amount?: number | null; booking_id?: string | null; product_order_id?: string | null };
    let refundRowsForSum = (refundAll ?? []) as RefundRow[];
    const refundLocationAttribution = summarizeLedgerLocationAttribution(refundRowsForSum, locationId);
    if (locationId) {
      refundRowsForSum = await filterLedgerRowsForLocation(
        supabaseAdmin,
        providerId,
        refundRowsForSum,
        locationId,
      );
    }

    // Get payment counts from booking_payments for stats
    let paymentsCountQuery = supabaseAdmin
      .from("booking_payments")
      .select("id, status", { count: "exact" })
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());
    if (bookingIds.length > 0) {
      paymentsCountQuery = paymentsCountQuery.in("booking_id", bookingIds);
    } else {
      paymentsCountQuery = paymentsCountQuery.eq("booking_id", "00000000-0000-0000-0000-000000000000");
    }
    const { data: payments } = await paymentsCountQuery;

    const periodStart = fromDate;
    const periodEnd = toDate;
    const dashOpts = {
      transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES,
      timezone: reportContext.timezone,
    };

    const { totalRevenue, revenueByBooking, revenueByProductOrder } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      periodStart,
      periodEnd,
      locationId,
      dashOpts,
    );
    const ledgerEarningsFromBookings = Array.from(revenueByBooking.values()).reduce((s, v) => s + v, 0);
    const ledgerEarningsFromProductOrders = Array.from(revenueByProductOrder.values()).reduce((s, v) => s + v, 0);
    const totalBookings = bookings?.length || 0;
    const completedBookings = bookings?.filter((b) => b.status === "completed").length || 0;
    const cancelledBookings = bookings?.filter((b) => b.status === "cancelled").length || 0;
    const noShows = bookings?.filter((b) => b.status === "no_show").length || 0;

    const uniqueClients = new Set(bookings?.map((b) => b.customer_id).filter(Boolean)).size;
    const totalStaff = staff?.length || 0;

    const totalPayments = payments?.length || 0;
    const successfulPayments = payments?.filter((p: any) => p.status === "completed" || p.status === "succeeded").length || 0;
    const totalRefunded = Math.abs(refundRowsForSum.reduce((sum, r) => sum + Number(r.amount || 0), 0));

    // Cancellation fees: provider-retained income from late cancellations
    let cancellationFeesTotal = 0;
    let tipsTotal = 0;
    let additionalChargesTotal = 0;
    let extraLocationAttribution: LedgerLocationAttributionSummary = {
      scopedByLocation: Boolean(locationId),
      excludedUnattributedRows: 0,
      note: locationId
        ? "No add-on ledger rows were available for location attribution."
        : "All provider locations and provider-level ledger rows.",
    };
    try {
      const { data: extraLedgerRows } = await supabaseAdmin
        .from("finance_transactions")
        .select("transaction_type, net, amount, booking_id, product_order_id")
        .eq("provider_id", providerId)
        .in("transaction_type", ["cancellation_fee", "tip", "additional_charge", "additional_charge_payment"])
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString());
      type ExtraLedgerRow = {
        transaction_type: string;
        net?: number;
        amount?: number;
        booking_id?: string | null;
        product_order_id?: string | null;
      };
      let scopedExtras = (extraLedgerRows ?? []) as ExtraLedgerRow[];
      extraLocationAttribution = summarizeLedgerLocationAttribution(scopedExtras, locationId);
      if (locationId) {
        scopedExtras = await filterLedgerRowsForLocation(supabaseAdmin, providerId, scopedExtras, locationId);
      }
      for (const r of scopedExtras) {
        const row = r as { transaction_type: string; net?: number; amount?: number };
        if (row.transaction_type === "cancellation_fee") {
          cancellationFeesTotal += Number(row.net ?? row.amount ?? 0);
        } else if (row.transaction_type === "tip") {
          tipsTotal += Math.abs(Number(row.amount ?? row.net ?? 0));
        } else if (row.transaction_type === "additional_charge" || row.transaction_type === "additional_charge_payment") {
          additionalChargesTotal += Number(row.net ?? row.amount ?? 0);
        }
      }
    } catch { /* non-critical */ }

    const netRevenue = totalRevenue + cancellationFeesTotal - totalRefunded;

    const totalEarningsFromBookings = Array.from(revenueByBooking.values()).reduce((sum, val) => sum + val, 0);
    const bookingsWithEarnings = revenueByBooking.size;
    const averageBookingValue = bookingsWithEarnings > 0 ? totalEarningsFromBookings / bookingsWithEarnings : 0;
    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;
    const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;
    const noShowRate = totalBookings > 0 ? (noShows / totalBookings) * 100 : 0;

    const prevRevenue = await getPreviousPeriodRevenue(
      supabaseAdmin,
      providerId,
      periodStart,
      periodEnd,
      locationId,
      dashOpts
    );
    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    const reportBasis =
      `Calendar in ${timezone}: ${fromYmd} through ${todayYmd}. ` +
      `Bookings use bookings.scheduled_at (every status). ` +
      `Headline revenue sums ledger transaction_type provider_earnings with finance_transactions.created_at in range (dashboard convention — excludes tips/travel rows); includes earnings linked to bookings and to product orders. ` +
      `Cash or unsupported terminal payments may not produce ledger rows. ` +
      `Growth compares this window to the immediately prior window of the same length.`;

    const basis = {
      calendar:
        period === "week"
          ? "Week to date (Monday start) through today."
          : period === "month"
            ? "Month to date through today."
            : period === "quarter"
              ? "Quarter to date through today."
              : "Year to date through today.",
      bookings:
        "Individual bookings with scheduled_at between period start and end of today (location filter when set).",
      ledgerHeadline:
        "Sum of net provider_earnings rows in range (settlement timestamp finance_transactions.created_at).",
      ledgerSplit:
        "ledgerEarningsFromBookings + ledgerEarningsFromProductOrders equals headline total when every row maps to a booking or order.",
      avgBookingValue:
        "Mean of provider_earnings attributed to bookings that have ledger earnings — not booking.total_amount.",
      payments:
        "booking_payments rows whose booking_id is in the scheduled bookings query and created_at in range.",
      netRevenue:
        "Headline ledger earnings + cancellation_fee net amounts − refund sums in attributed rows. Tips and additional_charge lines are reported separately.",
      growth:
        "Prior window ends at period start; same day-count as current window.",
      staff:
        "Count of provider_staff for this provider — not scoped to location.",
    };

    return successResponse({
      timezone,
      fromYmd,
      toYmd: todayYmd,
      period,
      totalRevenue,
      ledgerEarningsFromBookings,
      ledgerEarningsFromProductOrders,
      cancellationFees: cancellationFeesTotal,
      tipsTotal,
      additionalChargesTotal,
      netRevenue,
      totalBookings,
      completedBookings,
      cancelledBookings,
      noShows,
      uniqueClients,
      totalStaff,
      totalPayments,
      successfulPayments,
      totalRefunded,
      averageBookingValue,
      completionRate,
      cancellationRate,
      noShowRate,
      revenueGrowth,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      reportBasis,
      basis,
      report_basis: reportBasis,
      locationAttribution: {
        scopedByLocation: Boolean(locationId),
        excludedUnattributedRows:
          refundLocationAttribution.excludedUnattributedRows +
          extraLocationAttribution.excludedUnattributedRows,
        note:
          locationId
            ? "Location-filtered business overview excludes provider-level refund/add-on ledger rows with no booking/order linkage and reports them as unattributed."
            : "All provider locations and provider-level ledger rows.",
      },
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_OVERVIEW_ERROR", 500);
  }
}
