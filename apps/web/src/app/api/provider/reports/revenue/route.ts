import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { getProviderRevenue, getPreviousPeriodRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import { eachReportDateKey, getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const sp = request.nextUrl.searchParams;
    const locationId = sp.get("location_id") || null;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(sp, reportContext.timezone, { defaultDays: 30 });

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone: reportContext.timezone };

    const [{ totalRevenue, revenueByBooking, revenueByDate }, previousRevenue, cancelFeeResult] = await Promise.all([
      getProviderRevenue(supabaseAdmin, providerId, fromDate, toDate, locationId, dashOpts),
      getPreviousPeriodRevenue(supabaseAdmin, providerId, fromDate, toDate, locationId, dashOpts),
      supabaseAdmin
        .from("finance_transactions")
        .select("net")
        .eq("provider_id", providerId)
        .eq("transaction_type", "cancellation_fee")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString()),
    ]);
    const cancellationFees = (cancelFeeResult.data ?? []).reduce(
      (s, r) => s + Number((r as any).net ?? 0), 0
    );

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

    return successResponse({
      total_revenue: totalRevenue,
      cancellation_fees: cancellationFees,
      total_revenue_inclusive: totalRevenue + cancellationFees,
      previous_revenue: previousRevenue,
      revenue_by_service,
      revenue_by_staff,
      daily_trend,
      avg_per_booking: bookingCountWithRevenue > 0 ? totalRevenue / bookingCountWithRevenue : 0,
      transaction_count: bookingCountWithRevenue,
      time_basis: "ledger_created_at",
      time_basis_note: "Revenue from finance_transactions.created_at (payment date). Booking dates shown for service breakdown are scheduled_at.",
    });
  } catch (error) {
    console.error("Error in revenue report:", error);
    return handleApiError(error, "Failed to generate revenue report");
  }
}
