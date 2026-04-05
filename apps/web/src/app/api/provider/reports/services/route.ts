import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, startOfDay, endOfDay } from "date-fns";

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
    const locationId = sp.get("location_id") || null;
    const fromDate = sp.get("from") ? startOfDay(new Date(sp.get("from")!)) : startOfDay(subDays(new Date(), 30));
    const toDate = sp.get("to") ? endOfDay(new Date(sp.get("to")!)) : endOfDay(new Date());

    let bookingServicesQuery = supabaseAdmin
      .from("booking_services")
      .select(
        "booking_id, price, duration_minutes, offerings:offering_id(title), bookings!inner(provider_id, status, scheduled_at, location_id)",
      )
      .eq("bookings.provider_id", providerId)
      .gte("bookings.scheduled_at", fromDate.toISOString())
      .lte("bookings.scheduled_at", toDate.toISOString())
      .not("bookings.status", "in", "(cancelled,no_show)");
    if (locationId) bookingServicesQuery = bookingServicesQuery.eq("bookings.location_id", locationId);
    const { data: bookingServices } = await bookingServicesQuery;

    const serviceMap = new Map<
      string,
      { bookingIds: Set<string>; lineCount: number; revenue: number; totalDuration: number }
    >();

    (bookingServices || []).forEach((bs: any) => {
      const name = bs.offerings?.title || "Unknown Service";
      const existing = serviceMap.get(name) || {
        bookingIds: new Set<string>(),
        lineCount: 0,
        revenue: 0,
        totalDuration: 0,
      };
      if (bs.booking_id) existing.bookingIds.add(bs.booking_id);
      existing.lineCount += 1;
      existing.revenue += Number(bs.price || 0);
      existing.totalDuration += Number(bs.duration_minutes || 0);
      serviceMap.set(name, existing);
    });

    const entries = Array.from(serviceMap.entries());
    const totalRevenue = entries.reduce((s, [, d]) => s + d.revenue, 0);
    const totalLines = entries.reduce((s, [, d]) => s + d.lineCount, 0);

    return successResponse({
      most_popular: entries
        .map(([service, d]) => ({ service, bookings: d.bookingIds.size }))
        .sort((a, b) => b.bookings - a.bookings),
      revenue_by_service: entries
        .map(([service, d]) => ({ service, revenue: d.revenue }))
        .sort((a, b) => b.revenue - a.revenue),
      avg_duration: entries
        .map(([service, d]) => ({
          service,
          minutes: d.lineCount > 0 ? Math.round(d.totalDuration / d.lineCount) : 0,
        })),
      total_service_revenue: totalRevenue,
      avg_service_price: totalLines > 0 ? totalRevenue / totalLines : 0,
    });
  } catch (error) {
    console.error("Error in services report:", error);
    return handleApiError(error, "Failed to generate services report");
  }
}
