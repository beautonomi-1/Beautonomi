import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");


    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (providerError || !providerData?.id) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "month"; // day, week, month, year

    let fromDate: Date;
    let toDate = new Date();

    switch (period) {
      case "day":
        fromDate = subDays(toDate, 30);
        break;
      case "week":
        fromDate = startOfWeek(subDays(toDate, 12 * 7));
        toDate = endOfWeek(toDate);
        break;
      case "month":
        fromDate = startOfMonth(subDays(toDate, 12));
        toDate = endOfMonth(toDate);
        break;
      case "year":
        fromDate = startOfYear(subDays(toDate, 3));
        toDate = endOfYear(toDate);
        break;
      default:
        fromDate = subDays(toDate, 30);
    }

    // Get provider revenue from finance_transactions
    const { revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate
    );

    // Get bookings for counting
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .order("scheduled_at", { ascending: true });

    if (bookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Group by period using finance_transactions revenue
    const trendMap = new Map<string, { revenue: number; bookings: number }>();

    // Process revenue by date from finance_transactions
    revenueByDate.forEach((revenue, dateStr) => {
      const date = new Date(dateStr);
      let key: string;

      switch (period) {
        case "day":
          key = date.toISOString().split("T")[0];
          break;
        case "week":
          const weekStart = startOfWeek(date);
          key = weekStart.toISOString().split("T")[0];
          break;
        case "month":
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          break;
        case "year":
          key = String(date.getFullYear());
          break;
        default:
          key = date.toISOString().split("T")[0];
      }

      const existing = trendMap.get(key) || { revenue: 0, bookings: 0 };
      existing.revenue += revenue;
      trendMap.set(key, existing);
    });

    // Add booking counts
    bookings?.forEach((booking) => {
      const date = new Date(booking.scheduled_at);
      let key: string;

      switch (period) {
        case "day":
          key = date.toISOString().split("T")[0];
          break;
        case "week":
          const weekStart = startOfWeek(date);
          key = weekStart.toISOString().split("T")[0];
          break;
        case "month":
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          break;
        case "year":
          key = String(date.getFullYear());
          break;
        default:
          key = date.toISOString().split("T")[0];
      }

      const existing = trendMap.get(key) || { revenue: 0, bookings: 0 };
      existing.bookings += 1;
      trendMap.set(key, existing);
    });

    const trends = Array.from(trendMap.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Calculate growth
    let revenueGrowth = 0;
    let bookingsGrowth = 0;
    if (trends.length >= 2) {
      const current = trends[trends.length - 1];
      const previous = trends[trends.length - 2];
      revenueGrowth = previous.revenue > 0
        ? ((current.revenue - previous.revenue) / previous.revenue) * 100
        : 0;
      bookingsGrowth = previous.bookings > 0
        ? ((current.bookings - previous.bookings) / previous.bookings) * 100
        : 0;
    }

    // Summary
    const totalRevenue = trends.reduce((sum, t) => sum + t.revenue, 0);
    const totalBookings = trends.reduce((sum, t) => sum + t.bookings, 0);
    const averageRevenue = trends.length > 0 ? totalRevenue / trends.length : 0;

    return successResponse({
      period,
      trends,
      totalRevenue,
      totalBookings,
      averageRevenue,
      revenueGrowth,
      bookingsGrowth,
    });
  } catch (error) {
    return handleApiError(error, "REVENUE_TRENDS_ERROR", 500);
  }
}
