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
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import {
  RECOGNIZED_REVENUE_TYPES,
  computeProviderRevenueBreakdown,
  type ProviderRevenueBreakdown,
} from "@/lib/reports/provider-revenue-semantics";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Recognized-revenue + refund rows for one window, location-filtered, summarized via the canonical module. */
async function recognizedBreakdownForWindow(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  locationId: string | null,
  start: Date,
  end: Date,
): Promise<{ breakdown: ProviderRevenueBreakdown; attribution: LedgerLocationAttributionSummary }> {
  const { data } = await supabaseAdmin
    .from("finance_transactions")
    .select("transaction_type, net, amount, booking_id, product_order_id, refund_component")
    .eq("provider_id", providerId)
    .in("transaction_type", [...RECOGNIZED_REVENUE_TYPES, "refund"])
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  let rows = (data ?? []) as Array<{
    transaction_type: string;
    net?: number | null;
    amount?: number | null;
    booking_id?: string | null;
    product_order_id?: string | null;
    refund_component?: string | null;
  }>;
  const attribution = summarizeLedgerLocationAttribution(rows, locationId);
  if (locationId) {
    rows = await filterLedgerRowsForLocation(supabaseAdmin, providerId, rows, locationId);
  }
  return { breakdown: computeProviderRevenueBreakdown(rows), attribution };
}

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

    // provider_earnings split by source (service earnings only — a SUBSET of recognized revenue).
    const { revenueByBooking, revenueByProductOrder } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      periodStart,
      periodEnd,
      locationId,
      dashOpts,
    );
    const ledgerEarningsFromBookings = Array.from(revenueByBooking.values()).reduce((s, v) => s + v, 0);
    const ledgerEarningsFromProductOrders = Array.from(revenueByProductOrder.values()).reduce((s, v) => s + v, 0);

    // Single source of truth: recognized provider revenue (provider_earnings + tips +
    // travel + cancellation fees + walk-in add-ons) net of provider refund clawbacks.
    // Matches the dashboard headline, payment summary and sales history.
    const { breakdown, attribution: revenueLocationAttribution } = await recognizedBreakdownForWindow(
      supabaseAdmin,
      providerId,
      locationId,
      periodStart,
      periodEnd,
    );
    const totalRevenue = breakdown.recognizedRevenue;
    const serviceEarnings = breakdown.serviceEarnings;
    const cancellationFeesTotal = breakdown.cancellationFees;
    const tipsTotal = breakdown.tips;
    const travelFeesTotal = breakdown.travelFees;
    const walkInAdditionalChargesTotal = breakdown.walkInAdditionalCharges;
    const totalRefunded = breakdown.refundDeduction;
    const netRevenue = breakdown.netAfterRefunds;

    const totalBookings = bookings?.length || 0;
    const completedBookings = bookings?.filter((b) => b.status === "completed").length || 0;
    const cancelledBookings = bookings?.filter((b) => b.status === "cancelled").length || 0;
    const noShows = bookings?.filter((b) => b.status === "no_show").length || 0;

    const uniqueClients = new Set(bookings?.map((b) => b.customer_id).filter(Boolean)).size;

    let priorCustomersQuery = supabaseAdmin
      .from("bookings")
      .select("customer_id")
      .eq("provider_id", providerId)
      .lt("scheduled_at", fromDate.toISOString())
      .not("customer_id", "is", null);
    if (locationId) priorCustomersQuery = priorCustomersQuery.eq("location_id", locationId);
    const { data: priorCustomerRows } = await priorCustomersQuery;
    const customersBeforePeriod = new Set(
      (priorCustomerRows ?? [])
        .map((r) => (r as { customer_id?: string | null }).customer_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    const bookingCountPerCustomer = new Map<string, number>();
    for (const b of bookings ?? []) {
      const cid = b.customer_id;
      if (!cid) continue;
      bookingCountPerCustomer.set(cid, (bookingCountPerCustomer.get(cid) ?? 0) + 1);
    }
    const customersInPeriod = new Set(bookingCountPerCustomer.keys());
    let newThisPeriod = 0;
    let returningClients = 0;
    for (const cid of customersInPeriod) {
      if (!customersBeforePeriod.has(cid)) newThisPeriod += 1;
      if ((bookingCountPerCustomer.get(cid) ?? 0) > 1) returningClients += 1;
    }
    const retentionRate =
      uniqueClients > 0 ? Math.round((returningClients / uniqueClients) * 1000) / 10 : 0;

    const totalStaff = staff?.length || 0;

    const totalPayments = payments?.length || 0;
    const successfulPayments = payments?.filter((p: any) => p.status === "completed" || p.status === "succeeded").length || 0;

    const bookingsWithEarnings = revenueByBooking.size;
    const averageBookingValue = bookingsWithEarnings > 0 ? ledgerEarningsFromBookings / bookingsWithEarnings : 0;
    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;
    const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;
    const noShowRate = totalBookings > 0 ? (noShows / totalBookings) * 100 : 0;

    // Growth compares recognized revenue against the immediately prior equal-length window.
    const periodDays = Math.max(
      1,
      Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const prevStart = new Date(periodStart.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const { breakdown: prevBreakdown } = await recognizedBreakdownForWindow(
      supabaseAdmin,
      providerId,
      locationId,
      prevStart,
      periodStart,
    );
    const prevRevenue = prevBreakdown.recognizedRevenue;
    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    const reportBasis =
      `Calendar in ${timezone}: ${fromYmd} through ${todayYmd}. ` +
      `Bookings use bookings.scheduled_at (every status). ` +
      `Headline revenue is recognized provider revenue = provider_earnings + tips + travel fees + cancellation fees + walk-in add-ons, by finance_transactions.created_at in range; netRevenue subtracts provider refund clawbacks. serviceEarnings is the provider_earnings subset. ` +
      `Cash or unsupported terminal payments may not produce ledger rows. ` +
      `Growth compares recognized revenue to the immediately prior window of the same length.`;

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
        "Recognized provider revenue: provider_earnings + tips + travel + cancellation fees + walk-in add-ons (net per row), settlement timestamp finance_transactions.created_at.",
      serviceEarnings:
        "provider_earnings only (post-commission service take). A subset of totalRevenue; equals ledgerEarningsFromBookings + ledgerEarningsFromProductOrders when every earnings row maps to a booking or order.",
      avgBookingValue:
        "Mean of provider_earnings attributed to bookings that have ledger earnings — not booking.total_amount.",
      payments:
        "booking_payments rows whose booking_id is in the scheduled bookings query and created_at in range.",
      netRevenue:
        "Recognized revenue (totalRevenue) − provider refund clawbacks (provider-money refund components only).",
      growth:
        "Prior window ends at period start; same day-count as current window; compares recognized revenue.",
      staff:
        "Count of provider_staff for this provider — not scoped to location.",
    };

    return successResponse({
      timezone,
      fromYmd,
      toYmd: todayYmd,
      period,
      totalRevenue,
      serviceEarnings,
      ledgerEarningsFromBookings,
      ledgerEarningsFromProductOrders,
      cancellationFees: cancellationFeesTotal,
      tipsTotal,
      travelFeesTotal,
      walkInAdditionalChargesTotal,
      netRevenue,
      totalBookings,
      completedBookings,
      cancelledBookings,
      noShows,
      uniqueClients,
      new_this_period: newThisPeriod,
      returning: returningClients,
      retention_rate: retentionRate,
      product_revenue: ledgerEarningsFromProductOrders,
      product_orders_with_earnings: revenueByProductOrder.size,
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
        excludedUnattributedRows: revenueLocationAttribution.excludedUnattributedRows,
        note:
          locationId
            ? "Location-filtered business overview excludes provider-level recognized-revenue/refund ledger rows with no booking/order linkage and reports them as unattributed."
            : "All provider locations and provider-level ledger rows.",
      },
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_OVERVIEW_ERROR", 500);
  }
}
