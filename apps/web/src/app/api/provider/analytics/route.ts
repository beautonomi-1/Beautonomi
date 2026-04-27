import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import {
  sumTipNet,
  sumPlatformRetainedFees,
  sumRefundsLikeFinance,
  sumCancellationFeeNetAbs,
  sumSubscriptionAndAdsExpenses,
} from "@/lib/reports/analytics-ledger-breakdown";
import {
  subMonths,
  startOfMonth,
  endOfMonth,
  subWeeks,
  startOfWeek,
  endOfWeek,
  subYears,
  startOfYear,
  endOfYear,
} from "date-fns";

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
        revenue: { total: 0, thisMonth: 0, lastMonth: 0, growth: "0", period: "month", all_time: 0, current_period: 0, previous_period: 0 },
        earnings_breakdown: { basis: "", all_time: {}, current_period: {}, expenses: { all_time: 0, current_period: 0 } },
        expenses: { total: 0, this_month: 0, note: "Includes subscription fees, ad campaign payments, and other platform charges" },
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
      // Service popularity via RPC (F8) — DB-side aggregate, no app-level row cap.
      supabaseAdmin.rpc("provider_analytics_by_service", {
        p_provider_id: providerId,
        p_from: new Date(0).toISOString(),
        p_to: now.toISOString(),
        p_location_id: locationId,
      }),
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

    // provider_analytics_by_service returns { offering_id, offering_title, booking_count, revenue }
    type ServiceRow = { offering_id: string; offering_title: string; booking_count: number; revenue: number };
    const serviceRows: ServiceRow[] = Array.isArray(serviceDataResult.data)
      ? (serviceDataResult.data as ServiceRow[])
      : [];

    // Revenue trends — bucket size matches the selected period:
    //   week  → last 12 ISO weeks
    //   year  → last 5 calendar years
    //   month → last 12 calendar months (default)
    const trendPromises: Promise<{ month: string; revenue: number; bookings: number }>[] = [];

    type TrendBucket = { start: Date; end: Date; label: string };
    const trendBuckets: TrendBucket[] = [];

    if (period === "week") {
      for (let i = 11; i >= 0; i--) {
        const weekRef = subWeeks(now, i);
        const start = startOfWeek(weekRef, { weekStartsOn: 1 });
        const end = endOfWeek(weekRef, { weekStartsOn: 1 });
        trendBuckets.push({
          start,
          end,
          label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        });
      }
    } else if (period === "year") {
      for (let i = 4; i >= 0; i--) {
        const yearRef = subYears(now, i);
        const start = startOfYear(yearRef);
        const end = endOfYear(yearRef);
        trendBuckets.push({
          start,
          end,
          label: `${start.getFullYear()}`,
        });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const monthRef = subMonths(now, i);
        const start = startOfMonth(monthRef);
        const end = endOfMonth(monthRef);
        trendBuckets.push({
          start,
          end,
          label: start.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        });
      }
    }

    for (const bucket of trendBuckets) {
      trendPromises.push(
        Promise.all([
          getProviderRevenue(supabaseAdmin, providerId, bucket.start, bucket.end, locationId, dashOpts),
          (() => {
            let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId).gte("created_at", bucket.start.toISOString()).lte("created_at", bucket.end.toISOString());
            if (locationId) q = q.eq("location_id", locationId);
            return q;
          })(),
        ]).then(([revenueData, bookingsData]) => ({
          month: bucket.label,
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

    const currentRange = { from: thisMonthStart, to: thisMonthEndDate };

    let allTimeLB = {
      tips_net: 0,
      platform_fees_retained: 0,
      refunds: 0,
      cancellation_fees: 0,
      expenses_abs: 0,
    };
    let currentLB = { ...allTimeLB };

    try {
      const [atTips, atPlat, atRef, atCancel, atExp, curTips, curPlat, curRef, curCancel, curExp] =
        await Promise.all([
          sumTipNet(supabaseAdmin, providerId),
          sumPlatformRetainedFees(supabaseAdmin, providerId),
          sumRefundsLikeFinance(supabaseAdmin, providerId),
          sumCancellationFeeNetAbs(supabaseAdmin, providerId),
          sumSubscriptionAndAdsExpenses(supabaseAdmin, providerId),
          sumTipNet(supabaseAdmin, providerId, currentRange),
          sumPlatformRetainedFees(supabaseAdmin, providerId, currentRange),
          sumRefundsLikeFinance(supabaseAdmin, providerId, currentRange),
          sumCancellationFeeNetAbs(supabaseAdmin, providerId, currentRange),
          sumSubscriptionAndAdsExpenses(supabaseAdmin, providerId, currentRange),
        ]);
      allTimeLB = {
        tips_net: atTips,
        platform_fees_retained: atPlat,
        refunds: atRef,
        cancellation_fees: atCancel,
        expenses_abs: atExp.asAbs,
      };
      currentLB = {
        tips_net: curTips,
        platform_fees_retained: curPlat,
        refunds: curRef,
        cancellation_fees: curCancel,
        expenses_abs: curExp.asAbs,
      };
    } catch (e) {
      console.warn("Provider finance breakdown query failed:", e);
    }

    const earningsBasis =
      "Headline service revenue = sum of net `provider_earnings` in range (platform-settled; may exclude direct walk-in cash). " +
      "Tips are separate `tip` rows (net). Platform retained = `service_fee` + `platform_fee` (absolute). " +
      "Refunds = `refund` rows + negative `provider_earnings`, aligned with the finance page.";

    return successResponse({
      period,
      revenue: {
        // total: all-time `provider_earnings` net (headline) — use `all_time` for new clients
        total: totalRevenue,
        all_time: totalRevenue,
        thisMonth: thisMonthRevenue,
        current_period: thisMonthRevenue,
        lastMonth: lastMonthRevenue,
        previous_period: lastMonthRevenue,
        growth: revenueGrowth,
        period,
      },
      earnings_breakdown: {
        basis: earningsBasis,
        all_time: {
          service_earnings_net: totalRevenue,
          tips_net: allTimeLB.tips_net,
          cancellation_fees: allTimeLB.cancellation_fees,
          refunds: allTimeLB.refunds,
          platform_fees_retained: allTimeLB.platform_fees_retained,
        },
        current_period: {
          start: thisMonthStart.toISOString(),
          end: thisMonthEndDate.toISOString(),
          period,
          service_earnings_net: thisMonthRevenue,
          tips_net: currentLB.tips_net,
          cancellation_fees: currentLB.cancellation_fees,
          refunds: currentLB.refunds,
          platform_fees_retained: currentLB.platform_fees_retained,
        },
        // Legacy flat keys (prefer all_time / current_period)
        service_earnings: totalRevenue,
        cancellation_fees: allTimeLB.cancellation_fees,
        cancellation_fees_this_month: currentLB.cancellation_fees,
        tips: allTimeLB.tips_net,
        tips_this_month: currentLB.tips_net,
        refunds: allTimeLB.refunds,
        refunds_this_month: currentLB.refunds,
        platform_fees_paid: allTimeLB.platform_fees_retained,
        platform_fees_retained_this_month: currentLB.platform_fees_retained,
      },
      expenses: {
        total: allTimeLB.expenses_abs,
        this_month: currentLB.expenses_abs,
        all_time: allTimeLB.expenses_abs,
        current_period: currentLB.expenses_abs,
        note: "Includes subscription fees, ad campaign payments, and other platform charges (absolute sum of net amounts).",
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
      services: serviceRows
        .map((s) => ({ name: s.offering_title, count: Number(s.booking_count || 0), revenue: Number(s.revenue || 0) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      trends: trendsData,
    });
  } catch (error) {
    console.error("Error in analytics API:", error);
    return handleApiError(error, "Failed to fetch analytics");
  }
}
