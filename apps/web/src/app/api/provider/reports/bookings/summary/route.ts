import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { MAX_REPORT_DAYS, MAX_BOOKINGS_FOR_REPORT } from "@/lib/reports/constants";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );    const searchParams = request.nextUrl.searchParams;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const locationId = searchParams.get("location_id");
    let fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();

    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > MAX_REPORT_DAYS) {
      fromDate = subDays(toDate, MAX_REPORT_DAYS);
    }

    // Get all bookings
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        total_amount,
        scheduled_at,
        status,
        customer_id,
        location_id,
        booking_services (
          id,
          price,
          offering_id,
          staff_id,
          offerings:offering_id (
            title
          )
        )
      `
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());
    
    // Filter by location if provided
    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }
    
    const { data: bookings, error: bookingsError } = await bookingsQuery
      .order("scheduled_at", { ascending: false })
      .limit(MAX_BOOKINGS_FOR_REPORT);

    if (bookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Get provider revenue from finance_transactions
    const { totalRevenue, revenueByBooking, revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId || undefined
    );

    // Calculate summary metrics
    const totalBookings = bookings?.length || 0;
    const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    // Group by status
    const statusCounts: Record<string, number> = {};
    const statusRevenue: Record<string, number> = {};
    bookings?.forEach((booking) => {
      const status = booking.status || "unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      // Use revenue from finance_transactions for this booking
      const bookingRevenue = revenueByBooking.get(booking.id) || 0;
      statusRevenue[status] = (statusRevenue[status] || 0) + bookingRevenue;
    });

    // Group by day (use finance_transactions revenue)
    const bookingsByDay = new Map<string, { count: number; revenue: number }>();
    bookings?.forEach((booking) => {
      const date = new Date(booking.scheduled_at).toISOString().split("T")[0];
      const existing = bookingsByDay.get(date) || { count: 0, revenue: 0 };
      existing.count += 1;
      bookingsByDay.set(date, existing);
    });
    // Add revenue from finance_transactions
    revenueByDate.forEach((revenue, date) => {
      const existing = bookingsByDay.get(date) || { count: 0, revenue: 0 };
      existing.revenue += revenue;
      bookingsByDay.set(date, existing);
    });

    const dailyBookings = Array.from(bookingsByDay.entries())
      .map(([date, data]) => ({ date, count: data.count, revenue: data.revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Group by service - use finance_transactions revenue (consistent with status breakdown)
    const serviceMap = new Map<string, { serviceName: string; bookings: number; revenue: number }>();
    (bookings || []).forEach((booking) => {
      const bookingRevenue = revenueByBooking.get(booking.id) || 0;
      if (!booking.booking_services || !Array.isArray(booking.booking_services)) return;
      const totalServicePrice = booking.booking_services.reduce(
        (sum: number, s: any) => sum + Number(s.price || 0),
        0
      );
      booking.booking_services.forEach((bs: any) => {
        const serviceName = bs.offerings?.title || "Unknown";
        const existing = serviceMap.get(serviceName) || { serviceName, bookings: 0, revenue: 0 };
        existing.bookings += 1;
        const serviceProportion = totalServicePrice > 0
          ? Number(bs.price || 0) / totalServicePrice
          : 1 / booking.booking_services.length;
        existing.revenue += bookingRevenue * serviceProportion;
        serviceMap.set(serviceName, existing);
      });
    });

    const topServices = Array.from(serviceMap.values())
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 10);

    return successResponse({
      totalBookings,
      totalRevenue,
      averageBookingValue,
      statusBreakdown: Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        revenue: statusRevenue[status] || 0,
        percentage: totalBookings > 0 ? (count / totalBookings) * 100 : 0,
      })),
      dailyBookings,
      topServices,
    });
  } catch (error) {
    return handleApiError(error, "BOOKING_SUMMARY_ERROR", 500);
  }
}
