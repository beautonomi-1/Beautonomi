import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/subscription-metrics
 * 
 * Get comprehensive subscription revenue and metrics
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabaseAdmin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // 1. Get all active subscriptions with plan details
    let activeQuery = supabaseAdmin
      .from("provider_subscriptions")
      .select(`
        id,
        provider_id,
        plan_id,
        status,
        billing_period,
        started_at,
        next_payment_date,
        subscription_plans:plan_id (
          id,
          name,
          price_monthly,
          price_yearly,
          currency
        ),
        providers:provider_id (
          id,
          business_name,
          slug
        )
      `)
      .in("status", ["active", "trialing"]);

    if (startDate) {
      activeQuery = activeQuery.gte("started_at", startDate);
    }
    if (endDate) {
      activeQuery = activeQuery.lte("started_at", endDate);
    }

    const { data: activeSubscriptions, error: activeError } = await activeQuery;

    if (activeError) {
      console.error("Error fetching active subscriptions:", activeError);
    }

    // 2. Calculate MRR (Monthly Recurring Revenue)
    let mrr = 0;
    let monthlyCount = 0;
    let yearlyCount = 0;
    const revenueByPlan: Record<string, { count: number; revenue: number; name: string }> = {};

    if (activeSubscriptions) {
      activeSubscriptions.forEach((sub: any) => {
        const plan = sub.subscription_plans;
        if (!plan) return;

        const isMonthly = sub.billing_period === "monthly";
        const price = isMonthly ? plan.price_monthly : plan.price_yearly;
        
        if (price) {
          if (isMonthly) {
            mrr += price;
            monthlyCount++;
          } else {
            // Convert yearly to monthly for MRR
            mrr += price / 12;
            yearlyCount++;
          }

          // Track revenue by plan
          const planId = plan.id;
          if (!revenueByPlan[planId]) {
            revenueByPlan[planId] = {
              count: 0,
              revenue: 0,
              name: plan.name,
            };
          }
          revenueByPlan[planId].count++;
          revenueByPlan[planId].revenue += isMonthly ? price : price / 12;
        }
      });
    }

    // 3. Calculate ARR (Annual Recurring Revenue)
    const arr = mrr * 12;

    // 4. Get subscription statistics
    const { data: allSubscriptions, error: _allError } = await supabaseAdmin
      .from("provider_subscriptions")
      .select("id, status, billing_period, started_at, expires_at");

    let totalSubscriptions = 0;
    let activeCount = 0;
    let trialingCount = 0;
    let cancelledCount = 0;
    let pastDueCount = 0;
    let newThisMonth = 0;
    let cancelledThisMonth = 0;
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    if (allSubscriptions) {
      totalSubscriptions = allSubscriptions.length;
      allSubscriptions.forEach((sub: any) => {
        if (sub.status === "active") activeCount++;
        else if (sub.status === "trialing") trialingCount++;
        else if (sub.status === "cancelled") cancelledCount++;
        else if (sub.status === "past_due") pastDueCount++;

        const startedAt = new Date(sub.started_at);
        if (startedAt >= currentMonth) {
          newThisMonth++;
        }

        if (sub.status === "cancelled" && sub.expires_at) {
          const expiresAt = new Date(sub.expires_at);
          if (expiresAt >= currentMonth && expiresAt < new Date()) {
            cancelledThisMonth++;
          }
        }
      });
    }

    // 5. Calculate churn rate (cancelled this month / active at start of month)
    const activeAtMonthStart = activeCount + cancelledThisMonth;
    const churnRate = activeAtMonthStart > 0 
      ? (cancelledThisMonth / activeAtMonthStart) * 100 
      : 0;

    // 6. Calculate ARPU (Average Revenue Per User)
    const activeTotal = activeCount + trialingCount;
    const arpu = activeTotal > 0 ? mrr / activeTotal : 0;

    // 7. Get revenue trends (last 12 months)
    const revenueTrends = [];
    for (let i = 11; i >= 0; i--) {
      const month = new Date();
      month.setMonth(month.getMonth() - i);
      month.setDate(1);
      month.setHours(0, 0, 0, 0);
      
      const monthEnd = new Date(month);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);
      monthEnd.setHours(23, 59, 59, 999);

      // Get subscriptions active during this month
      // A subscription is active in a month if:
      // - It started before or during the month AND
      // - (It hasn't expired OR it expired after the month started)
      const { data: monthSubs } = await supabaseAdmin
        .from("provider_subscriptions")
        .select(`
          billing_period,
          status,
          started_at,
          expires_at,
          subscription_plans:plan_id (
            price_monthly,
            price_yearly
          )
        `)
        .in("status", ["active", "trialing"])
        .lte("started_at", monthEnd.toISOString())
        .or(`expires_at.is.null,expires_at.gte.${month.toISOString()}`);

      let monthRevenue = 0;
      if (monthSubs) {
        monthSubs.forEach((sub: any) => {
          const plan = sub.subscription_plans;
          if (!plan) return;
          
          const isMonthly = sub.billing_period === "monthly";
          const price = isMonthly ? plan.price_monthly : plan.price_yearly;
          
          if (price) {
            monthRevenue += isMonthly ? price : price / 12;
          }
        });
      }

      revenueTrends.push({
        month: month.toISOString().slice(0, 7), // YYYY-MM
        revenue: monthRevenue,
        label: month.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      });
    }

    // 8. Get top providers by subscription revenue
    const topProviders: Array<{ provider_id: string; business_name: string; revenue: number }> = [];
    const providerRevenue: Record<string, { business_name: string; revenue: number }> = {};

    if (activeSubscriptions) {
      activeSubscriptions.forEach((sub: any) => {
        const plan = sub.subscription_plans;
        const provider = sub.providers;
        if (!plan || !provider) return;

        const isMonthly = sub.billing_period === "monthly";
        const price = isMonthly ? plan.price_monthly : plan.price_yearly;
        
        if (price) {
          const providerId = sub.provider_id;
          if (!providerRevenue[providerId]) {
            providerRevenue[providerId] = {
              business_name: provider.business_name,
              revenue: 0,
            };
          }
          providerRevenue[providerId].revenue += isMonthly ? price : price / 12;
        }
      });
    }

    // Convert to array and sort
    Object.entries(providerRevenue).forEach(([providerId, data]) => {
      topProviders.push({
        provider_id: providerId,
        business_name: data.business_name,
        revenue: data.revenue,
      });
    });

    topProviders.sort((a, b) => b.revenue - a.revenue);
    const top10Providers = topProviders.slice(0, 10);

    // 9. Get subscription status breakdown
    const statusBreakdown = {
      active: activeCount,
      trialing: trialingCount,
      cancelled: cancelledCount,
      past_due: pastDueCount,
      inactive: totalSubscriptions - activeCount - trialingCount - cancelledCount - pastDueCount,
    };

    // 10. Get billing period breakdown
    const billingBreakdown = {
      monthly: monthlyCount,
      yearly: yearlyCount,
    };

    return successResponse({
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      total_subscriptions: totalSubscriptions,
      active_subscriptions: activeCount + trialingCount,
      status_breakdown: statusBreakdown,
      billing_breakdown: billingBreakdown,
      revenue_by_plan: Object.values(revenueByPlan).map(plan => ({
        plan_name: plan.name,
        count: plan.count,
        mrr: Math.round(plan.revenue * 100) / 100,
      })),
      churn_rate: Math.round(churnRate * 100) / 100,
      arpu: Math.round(arpu * 100) / 100,
      new_this_month: newThisMonth,
      cancelled_this_month: cancelledThisMonth,
      revenue_trends: revenueTrends,
      top_providers: top10Providers,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch subscription metrics");
  }
}
