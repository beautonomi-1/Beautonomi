import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
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
    const period = searchParams.get("period") || "month";
    const locationId = searchParams.get("location_id") || null;

    // Calculate date ranges based on period
    const now = new Date();
    let currentStart: Date;
    let currentEnd: Date;
    let previousStart: Date;
    let previousEnd: Date;

    if (period === "week") {
      const dayOfWeek = now.getDay(); // 0 = Sunday
      currentStart = new Date(now);
      currentStart.setDate(now.getDate() - dayOfWeek);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + 6);
      currentEnd.setHours(23, 59, 59, 999);
      previousStart = new Date(currentStart);
      previousStart.setDate(currentStart.getDate() - 7);
      previousEnd = new Date(currentEnd);
      previousEnd.setDate(currentEnd.getDate() - 7);
    } else if (period === "year") {
      currentStart = new Date(now.getFullYear(), 0, 1);
      currentEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      previousStart = new Date(now.getFullYear() - 1, 0, 1);
      previousEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    } else {
      // Default: month
      currentStart = startOfMonth(now);
      currentEnd = endOfMonth(now);
      previousStart = startOfMonth(subMonths(now, 1));
      previousEnd = endOfMonth(subMonths(now, 1));
    }

    const thisMonthStart = currentStart;
    const thisMonthEnd = currentEnd;
    const lastMonthStart = previousStart;
    const lastMonthEnd = previousEnd;

    // Ensure current period query only includes up to now (not future)
    const thisMonthEndDate = now < thisMonthEnd ? now : thisMonthEnd;

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES };

    // Parallel queries for better performance
    const [
      revenueResult,
      bookingsResult,
      upcomingBookingsResult,
      serviceDataResult,
      customerDataResult,
    ] = await Promise.all([
      // Revenue — same net as main provider dashboard revenue cards
      Promise.all([
        getProviderRevenue(supabaseAdmin, providerId, new Date(0), now, locationId, dashOpts),
        getProviderRevenue(supabaseAdmin, providerId, thisMonthStart, thisMonthEndDate, locationId, dashOpts),
        getProviderRevenue(supabaseAdmin, providerId, lastMonthStart, lastMonthEnd, locationId, dashOpts),
      ]),
      // Booking counts (parallel queries)
      Promise.all([
        (() => { let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId); if (locationId) q = q.eq("location_id", locationId); return q; })(),
        (() => { let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId).gte("created_at", thisMonthStart.toISOString()).lte("created_at", thisMonthEndDate.toISOString()); if (locationId) q = q.eq("location_id", locationId); return q; })(),
        (() => { let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId).gte("created_at", lastMonthStart.toISOString()).lte("created_at", lastMonthEnd.toISOString()); if (locationId) q = q.eq("location_id", locationId); return q; })(),
      ]),
      // Upcoming bookings
      (() => { let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId).eq("status", "confirmed").gt("scheduled_at", now.toISOString()); if (locationId) q = q.eq("location_id", locationId); return q; })(),
      // Service popularity (simplified query)
      supabaseAdmin
        .from("booking_services")
        .select(`
          booking_id,
          offering_id,
          price,
          offerings:offering_id (
            id,
            title
          )
        `)
        .eq("offerings.provider_id", providerId)
        .limit(1000),
      // Customer analytics
      (() => { let q = supabaseAdmin.from("bookings").select("customer_id").eq("provider_id", providerId); if (locationId) q = q.eq("location_id", locationId); return q; })(),
    ]);

    // Extract revenue data
    const [allTimeRevenue, thisMonthRevenueData, lastMonthRevenueData] = revenueResult;
    const totalRevenue = allTimeRevenue.totalRevenue;
    const thisMonthRevenue = thisMonthRevenueData.totalRevenue;
    const lastMonthRevenue = lastMonthRevenueData.totalRevenue;

    // Extract booking counts
    const [totalBookingsCount, thisMonthBookingsCount, lastMonthBookingsCount] = bookingsResult;
    const totalBookings = totalBookingsCount.count || 0;
    const thisMonthBookings = thisMonthBookingsCount.count || 0;
    const lastMonthBookings = lastMonthBookingsCount.count || 0;
    const upcomingBookings = upcomingBookingsResult.count || 0;

    // Process service stats (distinct bookings per offering, not raw line rows)
    const serviceStats = new Map<string, { name: string; bookingIds: Set<string>; revenue: number }>();
    if (serviceDataResult.data) {
      for (const service of serviceDataResult.data) {
        const offering = service.offerings as any;
        if (!offering) continue;
        const key = offering.id;
        if (!serviceStats.has(key)) {
          serviceStats.set(key, {
            name: offering.title || "Service",
            bookingIds: new Set<string>(),
            revenue: 0,
          });
        }
        const stat = serviceStats.get(key)!;
        const bid = (service as { booking_id?: string }).booking_id;
        if (bid) stat.bookingIds.add(bid);
        stat.revenue += Number(service.price || 0);
      }
    }

    // Revenue trends - 12 data points (months for month/year periods; weeks for week period)
    const trendPromises: Promise<{ month: string; revenue: number; bookings: number }>[] = [];

    for (let i = 11; i >= 0; i--) {
      const monthDate = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));
      const monthStr = monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });

      trendPromises.push(
        Promise.all([
          getProviderRevenue(supabaseAdmin, providerId, monthDate, monthEnd, locationId, dashOpts),
          (() => {
            let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId).gte("created_at", monthDate.toISOString()).lte("created_at", monthEnd.toISOString());
            if (locationId) q = q.eq("location_id", locationId);
            return q;
          })(),
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

    // Fetch tips, expenses (subscriptions & ads), and platform commission for this provider
    const EXPENSE_TYPES = ["provider_subscription_payment", "provider_ads_payment", "provider_expense"];
    const TIP_TYPE = "tip";
    const REFUND_TYPE = "refund";

    let tipsTotal = 0;
    let tipsThisMonth = 0;
    let expensesTotal = 0;
    let expensesThisMonth = 0;
    let refundsTotal = 0;
    let platformFeesTotal = 0;
    let cancellationFeesTotal = 0;
    let cancellationFeesThisMonth = 0;
    const CANCELLATION_FEE_TYPE = "cancellation_fee";

    try {
      const [tipsAllQ, tipsMonthQ, expAllQ, expMonthQ, refAllQ, platFeeQ, cancelAllQ, cancelMonthQ] = await Promise.all([
        supabaseAdmin.from("finance_transactions").select("amount").eq("provider_id", providerId).eq("transaction_type", TIP_TYPE),
        supabaseAdmin.from("finance_transactions").select("amount").eq("provider_id", providerId).eq("transaction_type", TIP_TYPE).gte("created_at", thisMonthStart.toISOString()).lte("created_at", thisMonthEndDate.toISOString()),
        supabaseAdmin.from("finance_transactions").select("amount").eq("provider_id", providerId).in("transaction_type", EXPENSE_TYPES),
        supabaseAdmin.from("finance_transactions").select("amount").eq("provider_id", providerId).in("transaction_type", EXPENSE_TYPES).gte("created_at", thisMonthStart.toISOString()).lte("created_at", thisMonthEndDate.toISOString()),
        supabaseAdmin.from("finance_transactions").select("amount").eq("provider_id", providerId).eq("transaction_type", REFUND_TYPE),
        supabaseAdmin.from("finance_transactions").select("net").eq("provider_id", providerId).eq("transaction_type", "payment"),
        supabaseAdmin.from("finance_transactions").select("amount").eq("provider_id", providerId).eq("transaction_type", CANCELLATION_FEE_TYPE),
        supabaseAdmin.from("finance_transactions").select("amount").eq("provider_id", providerId).eq("transaction_type", CANCELLATION_FEE_TYPE).gte("created_at", thisMonthStart.toISOString()).lte("created_at", thisMonthEndDate.toISOString()),
      ]);

      tipsTotal = (tipsAllQ.data ?? []).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
      tipsThisMonth = (tipsMonthQ.data ?? []).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
      expensesTotal = (expAllQ.data ?? []).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
      expensesThisMonth = (expMonthQ.data ?? []).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
      refundsTotal = (refAllQ.data ?? []).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
      platformFeesTotal = (platFeeQ.data ?? []).reduce((s, r) => s + Math.abs(Number(r.net || 0)), 0);
      cancellationFeesTotal = (cancelAllQ.data ?? []).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
      cancellationFeesThisMonth = (cancelMonthQ.data ?? []).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
    } catch (e) {
      console.warn("Provider finance breakdown query failed:", e);
    }

    return successResponse({
      revenue: {
        total: totalRevenue,
        thisMonth: thisMonthRevenue,
        lastMonth: lastMonthRevenue,
        growth: revenueGrowth,
      },
      earnings_breakdown: {
        service_earnings: totalRevenue,
        cancellation_fees: cancellationFeesTotal,
        cancellation_fees_this_month: cancellationFeesThisMonth,
        tips: tipsTotal,
        tips_this_month: tipsThisMonth,
        refunds: refundsTotal,
        platform_fees_paid: platformFeesTotal,
        net_after_refunds: totalRevenue + cancellationFeesTotal + tipsTotal - refundsTotal,
      },
      expenses: {
        total: expensesTotal,
        this_month: expensesThisMonth,
        note: "Includes subscription fees, ad campaign payments, and other platform charges",
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
        .map((s) => ({ name: s.name, count: s.bookingIds.size, revenue: s.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      trends: trendsData,
    });
  } catch (error) {
    console.error("Error in analytics API:", error);
    return handleApiError(error, "Failed to fetch analytics");
  }
}
