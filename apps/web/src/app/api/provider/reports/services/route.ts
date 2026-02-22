import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const sp = request.nextUrl.searchParams;
    const fromDate = sp.get("from") ? new Date(sp.get("from")!) : subDays(new Date(), 30);
    const toDate = sp.get("to") ? new Date(sp.get("to")!) : new Date();

    const { data: bookingServices } = await supabaseAdmin
      .from("booking_services")
      .select("price, duration_minutes, offerings:offering_id(title), bookings!inner(provider_id, status, scheduled_at)")
      .eq("bookings.provider_id", providerId)
      .gte("bookings.scheduled_at", fromDate.toISOString())
      .lte("bookings.scheduled_at", new Date(toDate.getTime() + 86400000).toISOString())
      .not("bookings.status", "in", "(cancelled,no_show)");

    const serviceMap = new Map<string, { bookings: number; revenue: number; totalDuration: number }>();

    (bookingServices || []).forEach((bs: any) => {
      const name = bs.offerings?.title || "Unknown Service";
      const existing = serviceMap.get(name) || { bookings: 0, revenue: 0, totalDuration: 0 };
      existing.bookings += 1;
      existing.revenue += Number(bs.price || 0);
      existing.totalDuration += Number(bs.duration_minutes || 0);
      serviceMap.set(name, existing);
    });

    const entries = Array.from(serviceMap.entries());
    const totalRevenue = entries.reduce((s, [, d]) => s + d.revenue, 0);
    const totalBookings = entries.reduce((s, [, d]) => s + d.bookings, 0);

    return successResponse({
      most_popular: entries
        .map(([service, d]) => ({ service, bookings: d.bookings }))
        .sort((a, b) => b.bookings - a.bookings),
      revenue_by_service: entries
        .map(([service, d]) => ({ service, revenue: d.revenue }))
        .sort((a, b) => b.revenue - a.revenue),
      avg_duration: entries
        .map(([service, d]) => ({ service, minutes: d.bookings > 0 ? Math.round(d.totalDuration / d.bookings) : 0 })),
      total_service_revenue: totalRevenue,
      avg_service_price: totalBookings > 0 ? totalRevenue / totalBookings : 0,
    });
  } catch (error) {
    console.error("Error in services report:", error);
    return handleApiError(error, "Failed to generate services report");
  }
}
