import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderNetAfterRefundsTotal,
  getProviderRevenue,
} from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import {
  sumTipNet,
  sumPlatformRetainedFees,
  sumRefundsLikeFinance,
  sumCancellationFeeNetAbs,
  sumSubscriptionAndAdsExpenses,
} from "@/lib/reports/analytics-ledger-breakdown";
import { subMonths, subWeeks, subYears, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  dateRangeBoundsUtc,
  endOfWeekInTz,
  formatDateYmd,
  formatInTz,
  startOfWeekInTz,
} from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { buildServiceLedgerPerformance } from "@/lib/reports/service-ledger-performance";

/**
 * GET /api/provider/analytics
 * 
 * Get provider analytics dashboard data (optimized)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return successResponse({
        period: "month",
        timezone: "UTC",
        windows: {
          current: { fromYmd: "", toYmd: "" },
          previous: { fromYmd: "", toYmd: "" },
        },
        basis: {},
        trends_meta: { bucket: "month", buckets_count: 0, description: "" },
        revenue: { total: 0, thisMonth: 0, lastMonth: 0, growth: "0", period: "month", all_time: 0, current_period: 0, previous_period: 0 },
        earnings_breakdown: { basis: "", all_time: {}, current_period: {}, expenses: { all_time: 0, current_period: 0 } },
        expenses: { total: 0, this_month: 0, note: "Includes subscription fees, ad campaign payments, and other platform charges" },
        bookings: { total: 0, thisMonth: 0, lastMonth: 0, upcoming: 0, growth: "0" },
        customers: { total: 0, repeat: 0, single_booking: 0, new: 0 },
        services: [],
        trends: [],
      });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "month";
    const locationId = searchParams.get("location_id") || null;

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const now = new Date();
    const zNow = toZonedTime(now, tz);

    let currentStart: Date;
    let currentEnd: Date;
    let previousStart: Date;
    let previousEnd: Date;

    if (period === "week") {
      const curStartYmd = formatDateYmd(startOfWeekInTz(now, tz, 1), tz);
      const curEndYmd = formatDateYmd(endOfWeekInTz(now, tz, 1), tz);
      const cur = dateRangeBoundsUtc(curStartYmd, curEndYmd, tz);
      currentStart = new Date(cur.fromIso);
      currentEnd = new Date(cur.toIso);

      const prevAnchor = subWeeks(now, 1);
      const prevStartYmd = formatDateYmd(startOfWeekInTz(prevAnchor, tz, 1), tz);
      const prevEndYmd = formatDateYmd(endOfWeekInTz(prevAnchor, tz, 1), tz);
      const prev = dateRangeBoundsUtc(prevStartYmd, prevEndYmd, tz);
      previousStart = new Date(prev.fromIso);
      previousEnd = new Date(prev.toIso);
    } else if (period === "year") {
      const curFrom = formatDateYmd(startOfYear(zNow), tz);
      const curTo = formatDateYmd(endOfYear(zNow), tz);
      const cur = dateRangeBoundsUtc(curFrom, curTo, tz);
      currentStart = new Date(cur.fromIso);
      currentEnd = new Date(cur.toIso);

      const prevY = subYears(zNow, 1);
      const prevFrom = formatDateYmd(startOfYear(prevY), tz);
      const prevTo = formatDateYmd(endOfYear(prevY), tz);
      const prev = dateRangeBoundsUtc(prevFrom, prevTo, tz);
      previousStart = new Date(prev.fromIso);
      previousEnd = new Date(prev.toIso);
    } else {
      const curFrom = formatDateYmd(startOfMonth(zNow), tz);
      const curTo = formatDateYmd(endOfMonth(zNow), tz);
      const cur = dateRangeBoundsUtc(curFrom, curTo, tz);
      currentStart = new Date(cur.fromIso);
      currentEnd = new Date(cur.toIso);

      const prevM = subMonths(zNow, 1);
      const prevFrom = formatDateYmd(startOfMonth(prevM), tz);
      const prevTo = formatDateYmd(endOfMonth(prevM), tz);
      const prev = dateRangeBoundsUtc(prevFrom, prevTo, tz);
      previousStart = new Date(prev.fromIso);
      previousEnd = new Date(prev.toIso);
    }

    const thisMonthStart = currentStart;
    const thisMonthEnd = currentEnd;
    const lastMonthStart = previousStart;
    const lastMonthEnd = previousEnd;

    // Ensure current period query only includes up to now (not future)
    const thisMonthEndDate = now < thisMonthEnd ? now : thisMonthEnd;

    // Parallel queries for better performance
    const [
      revenueResult,
      bookingsResult,
      upcomingBookingsResult,
      customerDataResult,
    ] = await Promise.all([
      // Headline revenue — recognized provider revenue net of refund clawbacks (matches business overview)
      Promise.all([
        getProviderNetAfterRefundsTotal(supabaseAdmin, providerId, new Date(0), now, locationId),
        getProviderNetAfterRefundsTotal(
          supabaseAdmin,
          providerId,
          thisMonthStart,
          thisMonthEndDate,
          locationId,
        ),
        getProviderNetAfterRefundsTotal(
          supabaseAdmin,
          providerId,
          lastMonthStart,
          lastMonthEnd,
          locationId,
        ),
      ]),
      // Booking counts (parallel queries)
      Promise.all([
        (() => { let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId); if (locationId) q = q.eq("location_id", locationId); return q; })(),
        (() => { let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId).gte("scheduled_at", thisMonthStart.toISOString()).lte("scheduled_at", thisMonthEndDate.toISOString()); if (locationId) q = q.eq("location_id", locationId); return q; })(),
        (() => { let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId).gte("scheduled_at", lastMonthStart.toISOString()).lte("scheduled_at", lastMonthEnd.toISOString()); if (locationId) q = q.eq("location_id", locationId); return q; })(),
      ]),
      // Upcoming bookings
      (() => { let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId).eq("status", "confirmed").gt("scheduled_at", now.toISOString()); if (locationId) q = q.eq("location_id", locationId); return q; })(),
      // Customer analytics
      (() => { let q = supabaseAdmin.from("bookings").select("customer_id").eq("provider_id", providerId); if (locationId) q = q.eq("location_id", locationId); return q; })(),
    ]);

    // Extract revenue data
    const [allTimeRevenue, thisMonthRevenue, lastMonthRevenue] = revenueResult;
    const totalRevenue = allTimeRevenue;

    // Extract booking counts
    const [totalBookingsCount, thisMonthBookingsCount, lastMonthBookingsCount] = bookingsResult;
    const totalBookings = totalBookingsCount.count || 0;
    const thisMonthBookings = thisMonthBookingsCount.count || 0;
    const lastMonthBookings = lastMonthBookingsCount.count || 0;
    const upcomingBookings = upcomingBookingsResult.count || 0;

    const serviceRows = await buildServiceLedgerPerformance(
      supabaseAdmin,
      providerId,
      thisMonthStart,
      thisMonthEndDate,
      locationId,
      tz,
      { status: "completed" },
    );

    // Revenue trends — bucket size matches the selected period:
    //   week  → last 12 ISO weeks
    //   year  → last 5 calendar years
    //   month → last 12 calendar months (default)
    const trendPromises: Promise<{ month: string; revenue: number; bookings: number }>[] = [];

    type TrendBucket = { start: Date; end: Date; label: string };
    const trendBuckets: TrendBucket[] = [];

    if (period === "week") {
      for (let i = 11; i >= 0; i--) {
        const refUtc = subWeeks(now, i);
        const startYmd = formatDateYmd(startOfWeekInTz(refUtc, tz, 1), tz);
        const endYmd = formatDateYmd(endOfWeekInTz(refUtc, tz, 1), tz);
        const { fromIso, toIso } = dateRangeBoundsUtc(startYmd, endYmd, tz);
        const start = new Date(fromIso);
        trendBuckets.push({
          start,
          end: new Date(toIso),
          label: formatInTz(start, "MMM d", tz),
        });
      }
    } else if (period === "year") {
      for (let i = 4; i >= 0; i--) {
        const yearRef = subYears(zNow, i);
        const startYmd = formatDateYmd(startOfYear(yearRef), tz);
        const endYmd = formatDateYmd(endOfYear(yearRef), tz);
        const { fromIso, toIso } = dateRangeBoundsUtc(startYmd, endYmd, tz);
        const start = new Date(fromIso);
        trendBuckets.push({
          start,
          end: new Date(toIso),
          label: formatInTz(start, "yyyy", tz),
        });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const monthRef = subMonths(zNow, i);
        const startYmd = formatDateYmd(startOfMonth(monthRef), tz);
        const endYmd = formatDateYmd(endOfMonth(monthRef), tz);
        const { fromIso, toIso } = dateRangeBoundsUtc(startYmd, endYmd, tz);
        const start = new Date(fromIso);
        trendBuckets.push({
          start,
          end: new Date(toIso),
          label: formatInTz(start, "MMM yyyy", tz),
        });
      }
    }

    for (const bucket of trendBuckets) {
      trendPromises.push(
        Promise.all([
          getProviderNetAfterRefundsTotal(
            supabaseAdmin,
            providerId,
            bucket.start,
            bucket.end,
            locationId,
          ),
          (() => {
            let q = supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("provider_id", providerId).gte("scheduled_at", bucket.start.toISOString()).lte("scheduled_at", bucket.end.toISOString());
            if (locationId) q = q.eq("location_id", locationId);
            return q;
          })(),
        ]).then(([revenueData, bookingsData]) => ({
          month: bucket.label,
          revenue: revenueData,
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
    const dashOpts = {
      transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES,
      timezone: tz,
    };
    const [allTimeServiceEarnings, currentServiceEarnings] = await Promise.all([
      getProviderRevenue(supabaseAdmin, providerId, new Date(0), now, locationId, dashOpts),
      getProviderRevenue(
        supabaseAdmin,
        providerId,
        thisMonthStart,
        thisMonthEndDate,
        locationId,
        dashOpts,
      ),
    ]);

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
      "Headline recognized revenue = sum of provider_earnings, tip, travel_fee, cancellation_fee, and walk-in add-ons net of provider refund clawbacks (matches business overview). " +
      "Tips are also broken out separately. Platform retained = `service_fee` + `platform_fee` (absolute). " +
      "Refunds = provider-money `refund` rows + negative `provider_earnings`, aligned with the finance page.";

    const curFromYmd = formatDateYmd(thisMonthStart, tz);
    const curToYmd = formatDateYmd(thisMonthEndDate, tz);
    const prevFromYmd = formatDateYmd(lastMonthStart, tz);
    const prevToYmd = formatDateYmd(lastMonthEnd, tz);

    const trendBucketDescription =
      period === "week"
        ? "Last 12 ISO weeks (Mon–Sun), provider timezone."
        : period === "year"
          ? "Last 5 calendar years."
          : "Last 12 calendar months.";

    const basis = {
      ledger_period:
        "Recognized provider revenue net of refund clawbacks by `finance_transactions.created_at` — aligned with business overview (platform-settled; direct cash walk-ins often absent).",
      ledger_all_time: "All-time sum of the same ledger rows through now.",
      period_window: `${curFromYmd}–${curToYmd} (${tz.replace(/_/g, " ")}) vs prior ${prevFromYmd}–${prevToYmd}.`,
      bookings_in_period:
        "Period totals and chart buckets count appointments whose `scheduled_at` falls in the window (aligned with booking reports).",
      upcoming_bookings: "`confirmed` with `scheduled_at` in the future (any creation date).",
      customers:
        "Distinct customers from bookings (scoped to location when filtered). Repeat = 2+ bookings ever with you; single-booking = exactly one — not the same as marketing “new”.",
      top_services:
        "Per-offering ledger net for completed appointments scheduled in the current period, allocated by line price share (same as Sales by service / top-services report).",
      trends_revenue: `Chart revenue per bucket: same ledger rule as period headline. ${trendBucketDescription}`,
      trends_bookings: `Chart bookings per bucket: same scheduled_at rule as period counts. ${trendBucketDescription}`,
    };

    return successResponse({
      period,
      timezone: tz,
      windows: {
        current: { fromYmd: curFromYmd, toYmd: curToYmd },
        previous: { fromYmd: prevFromYmd, toYmd: prevToYmd },
      },
      basis,
      trends_meta: {
        bucket: period,
        buckets_count: trendsData.length,
        description: trendBucketDescription,
      },
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
          recognized_revenue_net: totalRevenue,
          service_earnings: allTimeServiceEarnings.totalRevenue,
          /** @deprecated use recognized_revenue_net */
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
          recognized_revenue_net: thisMonthRevenue,
          service_earnings: currentServiceEarnings.totalRevenue,
          /** @deprecated use recognized_revenue_net */
          service_earnings_net: thisMonthRevenue,
          tips_net: currentLB.tips_net,
          cancellation_fees: currentLB.cancellation_fees,
          refunds: currentLB.refunds,
          platform_fees_retained: currentLB.platform_fees_retained,
        },
        // Legacy flat keys (prefer all_time / current_period)
        recognized_revenue_net: totalRevenue,
        service_earnings: allTimeServiceEarnings.totalRevenue,
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
        single_booking: uniqueCustomers.size - repeatCustomers,
        /** @deprecated misleading — use single_booking (not new-this-period) */
        new: uniqueCustomers.size - repeatCustomers,
      },
      services: serviceRows
        .map((s) => ({
          name: s.serviceName,
          count: s.bookingCount,
          revenue: s.revenue,
        }))
        .slice(0, 10),
      trends: trendsData,
    });
  } catch (error) {
    console.error("Error in analytics API:", error);
    return handleApiError(error, "Failed to fetch analytics");
  }
}
