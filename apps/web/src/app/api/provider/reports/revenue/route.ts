import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, eachDayOfInterval, format, startOfDay, endOfDay } from "date-fns";
import { getProviderRevenue, getPreviousPeriodRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";

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

    const fromDate = sp.get("from") ? startOfDay(new Date(sp.get("from")!)) : startOfDay(subDays(new Date(), 30));
    const toDate = sp.get("to") ? endOfDay(new Date(sp.get("to")!)) : endOfDay(new Date());

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES };

    const [{ totalRevenue, revenueByBooking, revenueByDate }, previousRevenue] = await Promise.all([
      getProviderRevenue(supabaseAdmin, providerId, fromDate, toDate, locationId, dashOpts),
      getPreviousPeriodRevenue(supabaseAdmin, providerId, fromDate, toDate, locationId, dashOpts),
    ]);

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

    const days = eachDayOfInterval({ start: fromDate, end: toDate });
    const daily_trend = days.map((d) => ({
      date: format(d, "yyyy-MM-dd"),
      revenue: revenueByDate.get(format(d, "yyyy-MM-dd")) ?? 0,
    }));

    const serviceMap = new Map<string, number>();
    (bookingsRes || []).forEach((b: any) => {
      const bRev = revenueByBooking.get(b.id) || 0;
      const services = b.booking_services || [];
      const total = services.reduce((s: number, sv: any) => s + Number(sv.price || 0), 0);
      services.forEach((sv: any) => {
        const name = sv.offerings?.title || "Unknown";
        const proportion = total > 0 ? Number(sv.price || 0) / total : 1 / Math.max(services.length, 1);
        serviceMap.set(name, (serviceMap.get(name) ?? 0) + bRev * proportion);
      });
    });

    const revenue_by_service = Array.from(serviceMap.entries())
      .map(([service, revenue]) => ({ service, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    let bookingCountWithRevenue = 0;
    revenueByBooking.forEach((v) => {
      if (v > 0) bookingCountWithRevenue += 1;
    });

    return successResponse({
      total_revenue: totalRevenue,
      previous_revenue: previousRevenue,
      revenue_by_service,
      revenue_by_staff: [] as { staff: string; revenue: number }[],
      daily_trend,
      avg_per_booking: bookingCountWithRevenue > 0 ? totalRevenue / bookingCountWithRevenue : 0,
      transaction_count: bookingCountWithRevenue,
    });
  } catch (error) {
    console.error("Error in revenue report:", error);
    return handleApiError(error, "Failed to generate revenue report");
  }
}
