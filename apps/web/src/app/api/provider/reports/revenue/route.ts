import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, eachDayOfInterval, format } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );    const sp = request.nextUrl.searchParams;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const fromDate = sp.get("from") ? new Date(sp.get("from")!) : subDays(new Date(), 30);
    const toDate = sp.get("to") ? new Date(sp.get("to")!) : new Date();

    const [earningsRes, bookingsRes] = await Promise.all([
      supabaseAdmin
        .from("finance_transactions")
        .select("net, amount, created_at, booking_id")
        .eq("provider_id", providerId)
        .eq("transaction_type", "provider_earnings")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", new Date(toDate.getTime() + 86400000).toISOString()),
      supabaseAdmin
        .from("bookings")
        .select("id, scheduled_at, booking_services(price, staff_id, offerings:offering_id(title)), provider_staff:booking_services(staff_id, provider_staff:staff_id(users(full_name)))")
        .eq("provider_id", providerId)
        .gte("scheduled_at", fromDate.toISOString())
        .lte("scheduled_at", new Date(toDate.getTime() + 86400000).toISOString())
        .not("status", "in", "(cancelled,no_show)"),
    ]);

    const rows = earningsRes.data || [];
    const totalRevenue = rows.reduce((s, r: any) => s + Number(r.net ?? r.amount ?? 0), 0);

    const prevFrom = subDays(fromDate, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));
    const { data: prevRows } = await supabaseAdmin
      .from("finance_transactions")
      .select("net, amount")
      .eq("provider_id", providerId)
      .eq("transaction_type", "provider_earnings")
      .gte("created_at", prevFrom.toISOString())
      .lte("created_at", fromDate.toISOString());
    const previousRevenue = (prevRows || []).reduce((s, r: any) => s + Number(r.net ?? r.amount ?? 0), 0);

    const days = eachDayOfInterval({ start: fromDate, end: toDate });
    const dailyMap = new Map<string, number>();
    days.forEach((d) => dailyMap.set(format(d, "yyyy-MM-dd"), 0));
    rows.forEach((r: any) => {
      const day = format(new Date(r.created_at), "yyyy-MM-dd");
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + Number(r.net ?? r.amount ?? 0));
    });
    const daily_trend = days.map((d) => ({ date: format(d, "yyyy-MM-dd"), revenue: dailyMap.get(format(d, "yyyy-MM-dd")) ?? 0 }));

    const serviceMap = new Map<string, number>();
    const _staffMap = new Map<string, number>();
    const revenueByBooking = new Map<string, number>();
    rows.forEach((r: any) => {
      if (r.booking_id) revenueByBooking.set(r.booking_id, (revenueByBooking.get(r.booking_id) ?? 0) + Number(r.net ?? r.amount ?? 0));
    });

    (bookingsRes.data || []).forEach((b: any) => {
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

    const transactionCount = rows.length;

    return successResponse({
      total_revenue: totalRevenue,
      previous_revenue: previousRevenue,
      revenue_by_service,
      revenue_by_staff: [] as { staff: string; revenue: number }[],
      daily_trend,
      avg_per_booking: transactionCount > 0 ? totalRevenue / transactionCount : 0,
      transaction_count: transactionCount,
    });
  } catch (error) {
    console.error("Error in revenue report:", error);
    return handleApiError(error, "Failed to generate revenue report");
  }
}
