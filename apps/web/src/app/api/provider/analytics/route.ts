import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

/**
 * GET /api/provider/analytics
 * 
 * Get provider analytics dashboard data (optimized)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    
    // Use service role client for better performance
    const supabaseAdmin = createClient(
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
    if (!providerId) {
      return successResponse({
        revenue: { total: 0, thisMonth: 0, lastMonth: 0, growth: "0" },
        bookings: { total: 0, thisMonth: 0, lastMonth: 0, upcoming: 0, growth: "0" },
        customers: { total: 0, repeat: 0, new: 0 },
        services: [],
        trends: [],
      });
    }

    const searchParams = request.nextUrl.searchParams;
    const _period = searchParams.get("period") || "month";

    // Calculate date ranges
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    const _twelveMonthsAgo = subMonths(now, 12);
    
    // Ensure this month query only includes up to current date (not future)
    const thisMonthEndDate = now < thisMonthEnd ? now : thisMonthEnd;

    // Parallel queries for better performance
    const [
      revenueResult,
      bookingsResult,
      upcomingBookingsResult,
      serviceDataResult,
      customerDataResult,
    ] = await Promise.all([
      // Revenue from finance_transactions (accurate provider earnings)
      Promise.all([
        getProviderRevenue(supabaseAdmin, providerId, new Date(0), now),
        getProviderRevenue(supabaseAdmin, providerId, thisMonthStart, thisMonthEndDate),
        getProviderRevenue(supabaseAdmin, providerId, lastMonthStart, lastMonthEnd),
      ]),
      // Booking counts (parallel queries)
      Promise.all([
        supabaseAdmin
          .from("bookings")
          .select("id, created_at", { count: "exact", head: true })
          .eq("provider_id", providerId),
        supabaseAdmin
          .from("bookings")
          .select("id")
          .eq("provider_id", providerId)
          .gte("created_at", thisMonthStart.toISOString())
          .lte("created_at", thisMonthEndDate.toISOString()),
        supabaseAdmin
          .from("bookings")
          .select("id")
          .eq("provider_id", providerId)
          .gte("created_at", lastMonthStart.toISOString())
          .lte("created_at", lastMonthEnd.toISOString()),
      ]),
      // Upcoming bookings
      supabaseAdmin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("status", "confirmed")
        .gt("scheduled_at", now.toISOString()),
      // Service popularity (simplified query)
      supabaseAdmin
        .from("booking_services")
        .select(`
          offering_id,
          price,
          offerings:offering_id (
            id,
            title
          )
        `)
        .eq("offerings.provider_id", providerId)
        .limit(1000), // Limit to prevent huge queries
      // Customer analytics
      supabaseAdmin
        .from("bookings")
        .select("customer_id")
        .eq("provider_id", providerId),
    ]);

    // Extract revenue data
    const [allTimeRevenue, thisMonthRevenueData, lastMonthRevenueData] = revenueResult;
    const totalRevenue = allTimeRevenue.totalRevenue;
    const thisMonthRevenue = thisMonthRevenueData.totalRevenue;
    const lastMonthRevenue = lastMonthRevenueData.totalRevenue;

    // Extract booking counts
    const [totalBookingsCount, thisMonthBookingsData, lastMonthBookingsData] = bookingsResult;
    const totalBookings = totalBookingsCount.count || 0;
    const thisMonthBookings = thisMonthBookingsData.data?.length || 0;
    const lastMonthBookings = lastMonthBookingsData.data?.length || 0;
    const upcomingBookings = upcomingBookingsResult.count || 0;

    // Process service stats
    const serviceStats = new Map<string, { name: string; count: number; revenue: number }>();
    if (serviceDataResult.data) {
      for (const service of serviceDataResult.data) {
        const offering = service.offerings as any;
        if (!offering) continue;
        const key = offering.id;
        if (!serviceStats.has(key)) {
          serviceStats.set(key, {
            name: offering.title || "Service",
            count: 0,
            revenue: 0,
          });
        }
        const stat = serviceStats.get(key)!;
        stat.count++;
        stat.revenue += Number(service.price || 0);
      }
    }

    // Revenue trends (last 12 months) - optimized single query approach
    const _trends: Array<{ month: string; revenue: number; bookings: number }> = [];
    const trendPromises: Promise<{ month: string; revenue: number; bookings: number }>[] = [];
    
    for (let i = 11; i >= 0; i--) {
      const monthDate = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));
      const monthStr = monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });

      trendPromises.push(
        Promise.all([
          getProviderRevenue(supabaseAdmin, providerId, monthDate, monthEnd),
          supabaseAdmin
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("provider_id", providerId)
            .gte("created_at", monthDate.toISOString())
            .lte("created_at", monthEnd.toISOString()),
        ]).then(([revenueData, bookingsData]) => ({
          month: monthStr,
          revenue: revenueData.totalRevenue,
          bookings: bookingsData.count || 0,
        }))
      );
    }

    const trendsData = await Promise.all(trendPromises);

    // Customer analytics
    const customerData = customerDataResult.data || [];
    const uniqueCustomers = new Set(customerData.map((b) => b.customer_id).filter(Boolean));
    const customerCounts = new Map<string, number>();
    customerData.forEach((b) => {
      if (b.customer_id) {
        customerCounts.set(b.customer_id, (customerCounts.get(b.customer_id) || 0) + 1);
      }
    });
    const repeatCustomers = Array.from(customerCounts.values()).filter((count) => count > 1).length;

    // Calculate growth percentages
    let revenueGrowth: string;
    if (lastMonthRevenue === 0) {
      revenueGrowth = thisMonthRevenue > 0 ? "New" : "0";
    } else {
      const growth = ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100);
      revenueGrowth = growth.toFixed(1);
    }

    let bookingsGrowth: string;
    if (lastMonthBookings === 0) {
      bookingsGrowth = thisMonthBookings > 0 ? "New" : "0";
    } else {
      const growth = ((thisMonthBookings - lastMonthBookings) / lastMonthBookings * 100);
      bookingsGrowth = growth.toFixed(1);
    }

    return successResponse({
      revenue: {
        total: totalRevenue,
        thisMonth: thisMonthRevenue,
        lastMonth: lastMonthRevenue,
        growth: revenueGrowth,
      },
      bookings: {
        total: totalBookings,
        thisMonth: thisMonthBookings,
        lastMonth: lastMonthBookings,
        upcoming: upcomingBookings,
        growth: bookingsGrowth,
      },
      customers: {
        total: uniqueCustomers.size,
        repeat: repeatCustomers,
        new: uniqueCustomers.size - repeatCustomers,
      },
      services: Array.from(serviceStats.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10), // Top 10 services
      trends: trendsData,
    });
  } catch (error) {
    console.error("Error in analytics API:", error);
    return handleApiError(error, "Failed to fetch analytics");
  }
}
