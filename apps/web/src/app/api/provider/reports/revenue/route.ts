import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderRevenue, getPreviousPeriodRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import {
  eachReportDateKey,
  filterLedgerRowsForLocation,
  getProviderReportContext,
  reportDateRangeFromParams,
  summarizeLedgerLocationAttribution,
} from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = getSupabaseAdmin();
    const sp = request.nextUrl.searchParams;
    const locationId = sp.get("location_id") || null;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(sp, reportContext.timezone, { defaultDays: 30 });

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone: reportContext.timezone };

    const [{ totalRevenue, revenueByBooking, revenueByProductOrder, revenueByDate }, previousRevenue, cancelFeeResult] =
      await Promise.all([
      getProviderRevenue(supabaseAdmin, providerId, fromDate, toDate, locationId, dashOpts),
      getPreviousPeriodRevenue(supabaseAdmin, providerId, fromDate, toDate, locationId, dashOpts),
      supabaseAdmin
        .from("finance_transactions")
        .select("net, booking_id, product_order_id")
        .eq("provider_id", providerId)
        .eq("transaction_type", "cancellation_fee")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString()),
    ]);
    type CancelFeeRow = { net?: number | null; booking_id?: string | null; product_order_id?: string | null };
    let cancelRows = (cancelFeeResult.data ?? []) as CancelFeeRow[];
    const cancellationFeeLocationAttribution = summarizeLedgerLocationAttribution(cancelRows, locationId);
    if (locationId) {
      cancelRows = await filterLedgerRowsForLocation(supabaseAdmin, providerId, cancelRows, locationId);
    }
    const cancellationFees = cancelRows.reduce((s, r) => s + Number(r.net ?? 0), 0);

    let bkQuery = supabaseAdmin
      .from("bookings")
      .select(
        "id, scheduled_at, booking_services(price, staff_id, offerings:offering_id(title)), provider_staff:booking_services(staff_id, provider_staff:staff_id(users(full_name)))",
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .not("status", "in", "(cancelled,no_show)");
    if (locationId) bkQuery = bkQuery.eq("location_id", locationId);
    const { data: bookingsRes } = await bkQuery;

    const staffIds = [
      ...new Set(
        (bookingsRes || []).flatMap((b: any) =>
          (b.booking_services || [])
            .map((sv: any) => sv.staff_id)
            .filter(Boolean),
        ),
      ),
    ];
    const staffNameById = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staffRows } = await supabaseAdmin
        .from("provider_staff")
        .select("id, users(full_name)")
        .in("id", staffIds);
      (staffRows || []).forEach((row: any) => {
        const userName = Array.isArray(row.users) ? row.users[0]?.full_name : row.users?.full_name;
        staffNameById.set(row.id, userName || "Unassigned");
      });
    }

    const daily_trend = eachReportDateKey(fromYmd, toYmd).map((date) => ({
      date,
      revenue: revenueByDate.get(date) ?? 0,
    }));

    const serviceMap = new Map<string, number>();
    const staffMap = new Map<string, number>();
    (bookingsRes || []).forEach((b: any) => {
      const bRev = revenueByBooking.get(b.id) || 0;
      const services = b.booking_services || [];
      const total = services.reduce((s: number, sv: any) => s + Number(sv.price || 0), 0);
      services.forEach((sv: any) => {
        const name = sv.offerings?.title || "Unknown";
        const proportion = total > 0 ? Number(sv.price || 0) / total : 1 / Math.max(services.length, 1);
        const allocatedRevenue = bRev * proportion;
        serviceMap.set(name, (serviceMap.get(name) ?? 0) + allocatedRevenue);
        const staffName = sv.staff_id ? staffNameById.get(sv.staff_id) || "Unassigned" : "Unassigned";
        staffMap.set(staffName, (staffMap.get(staffName) ?? 0) + allocatedRevenue);
      });
    });

    const revenue_by_service = Array.from(serviceMap.entries())
      .map(([service, revenue]) => ({ service, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
    const revenue_by_staff = Array.from(staffMap.entries())
      .map(([staff, revenue]) => ({ staff, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    let bookingCountWithRevenue = 0;
    revenueByBooking.forEach((v) => {
      if (v > 0) bookingCountWithRevenue += 1;
    });

    const ledgerFromBookings = Array.from(revenueByBooking.values()).reduce((s, v) => s + v, 0);
    const ledgerFromProductOrders = Array.from(revenueByProductOrder.values()).reduce((s, v) => s + v, 0);

    const avgLedgerPerBookingWithEarnings =
      bookingCountWithRevenue > 0 ? ledgerFromBookings / bookingCountWithRevenue : 0;

    const reportBasis =
      `Window ${fromYmd}–${toYmd} (${reportContext.timezone}). ` +
      `Headline total_revenue sums provider_earnings ledger rows (finance_transactions.created_at) — includes product-order earnings. ` +
      `Cancellation fees from cancellation_fee rows add to total_revenue_inclusive. ` +
      `Service and staff breakdowns allocate **booking-linked** ledger only across booking_services lines by price share — retail-only ledger does not appear there. ` +
      `Daily trend rolls up ledger net by calendar day (recognition date). ` +
      `avg_per_booking is mean booking-linked ledger ÷ count of bookings with positive ledger allocation — not booking.total_amount. ` +
      `previous_revenue compares the immediately prior equal-length window ending at period start.`;

    const basis = {
      headline:
        "provider_earnings transaction_type; settlement timestamp finance_transactions.created_at.",
      bookingsMix:
        "Product-order earnings appear in headline total and daily trend but not in per-service/staff booking allocation.",
      breakdown:
        "Per-service/staff uses ledger attributed to each booking, split by line prices.",
      avgPerBooking:
        "Sum(provider_earnings allocated to bookings) ÷ bookings with any ledger allocation.",
      dailyTrend: "revenueByDate keys — same ledger rules as headline.",
    };

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      total_revenue: totalRevenue,
      ledger_from_bookings: ledgerFromBookings,
      ledger_from_product_orders: ledgerFromProductOrders,
      cancellation_fees: cancellationFees,
      total_revenue_inclusive: totalRevenue + cancellationFees,
      previous_revenue: previousRevenue,
      revenue_by_service,
      revenue_by_staff,
      daily_trend,
      avg_per_booking: avgLedgerPerBookingWithEarnings,
      transaction_count: bookingCountWithRevenue,
      bookings_with_ledger_earnings: bookingCountWithRevenue,
      time_basis: "ledger_created_at",
      time_basis_note:
        "Headline revenue uses finance_transactions.created_at. Service/staff tables allocate booking-linked ledger by scheduled booking (scheduled_at).",
      reportBasis,
      basis,
      report_basis: reportBasis,
      locationAttribution: cancellationFeeLocationAttribution,
    });
  } catch (error) {
    console.error("Error in revenue report:", error);
    return handleApiError(error, "Failed to generate revenue report");
  }
}
