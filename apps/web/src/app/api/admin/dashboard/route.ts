import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';

export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);

    const supabase = await getSupabaseServer();
    
    if (!supabase) {
      console.error("Failed to get Supabase client");
      return handleApiError(new Error("Database connection failed"), 'Failed to load dashboard data');
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Run all count queries in parallel for better performance
    // Handle errors gracefully for each query
    const queryResults = await Promise.allSettled([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'customer').gte('created_at', startOfMonth.toISOString()),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'customer').gte('created_at', startOfLastMonth.toISOString()).lte('created_at', endOfLastMonth.toISOString()),
      supabase.from('providers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('providers').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', startOfMonth.toISOString()),
      supabase.from('providers').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', startOfLastMonth.toISOString()).lte('created_at', endOfLastMonth.toISOString()),
      supabase.from("bookings").select("*", { count: "exact", head: true }),
      supabase.from("bookings").select("*", { count: "exact", head: true }).gte("created_at", startOfToday.toISOString()),
      supabase.from("bookings").select("*", { count: "exact", head: true }).gte("created_at", startOfMonth.toISOString()),
      supabase.from("bookings").select("*", { count: "exact", head: true }).gte("created_at", startOfLastMonth.toISOString()).lte("created_at", endOfLastMonth.toISOString()),
      supabase.from('providers').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval')
    ]);

    // Extract counts with error handling
    const getCount = (result: PromiseSettledResult<any>) => {
      if (result.status === 'rejected') {
        console.error("Query rejected:", result.reason);
        return 0;
      }
      if (result.value.error) {
        console.error("Query error:", result.value.error);
        return 0;
      }
      return result.value.count || 0;
    };

    const totalUsers = getCount(queryResults[0]);
    const usersThisMonth = getCount(queryResults[1]);
    const usersLastMonth = getCount(queryResults[2]);
    const totalProviders = getCount(queryResults[3]);
    const providersThisMonth = getCount(queryResults[4]);
    const providersLastMonth = getCount(queryResults[5]);
    const totalBookings = getCount(queryResults[6]);
    const bookingsToday = getCount(queryResults[7]);
    const bookingsThisMonth = getCount(queryResults[8]);
    const bookingsLastMonth = getCount(queryResults[9]);
    const pendingApprovals = getCount(queryResults[10]);

    // Revenue streams from finance ledger - optimized to avoid fetching all rows
    // For total, we'll calculate from last 2 years to avoid timeout (can be made configurable)
    const twoYearsAgo = new Date(now.getFullYear() - 2, 0, 1);
    
    const sumLedger = async (startISO: string, endISO?: string) => {
      try {
        // Build query with date filters - only select needed fields
        let baseQuery = supabase
          .from("finance_transactions")
          .select("transaction_type, amount, net, fees")
          .gte("created_at", startISO);
        
        if (endISO) {
          baseQuery = baseQuery.lte("created_at", endISO);
        }

        const { data, error } = await baseQuery;
        
        if (error) {
          console.error("Error fetching finance transactions:", error);
          // Return zeros if query fails
          return {
            service_collected_net: 0,
            platform_commission_gross: 0,
            platform_refund_impact: 0,
            platform_commission_net: 0,
            gateway_fees: 0,
            platform_take_net: 0,
            tips_gross: 0,
            taxes_gross: 0,
            subscription_net: 0,
            subscription_gateway_fees: 0,
            gift_cards: 0,
            memberships: 0,
            refunds_gross: 0,
          };
        }
        
        const rows = data || [];
        
        // Calculate sums using in-memory aggregation
        const sum = (types: string[], field: "amount" | "net") =>
          rows.filter((r: any) => types.includes(r.transaction_type)).reduce((s: number, r: any) => s + Number(r[field] || 0), 0);
        const sumFees = (types: string[]) =>
          rows.filter((r: any) => types.includes(r.transaction_type)).reduce((s: number, r: any) => s + Number((r as any).fees || 0), 0);
        
        return {
          service_collected_net: sum(["payment", "additional_charge_payment"], "amount"),
          platform_commission_gross: sum(["payment", "additional_charge_payment"], "net"),
          platform_refund_impact: sum(["refund"], "net"),
          platform_commission_net: sum(["payment", "additional_charge_payment"], "net") + sum(["refund"], "net"),
          gateway_fees: sumFees(["payment", "additional_charge_payment"]),
          platform_take_net: (sum(["payment", "additional_charge_payment"], "net") + sum(["refund"], "net")) - sumFees(["payment", "additional_charge_payment"]),
          tips_gross: sum(["tip"], "amount"),
          taxes_gross: sum(["tax"], "amount"),
          subscription_net: sum(["provider_subscription_payment"], "net"),
          subscription_gateway_fees: sumFees(["provider_subscription_payment"]),
          gift_cards: sum(["gift_card_sale"], "amount"),
          memberships: sum(["membership_sale"], "amount"),
          refunds_gross: -sum(["refund"], "amount"),
        };
      } catch (err) {
        console.error("Error in sumLedger:", err);
        // Return zeros on error
        return {
          service_collected_net: 0,
          platform_commission_gross: 0,
          platform_refund_impact: 0,
          platform_commission_net: 0,
          gateway_fees: 0,
          platform_take_net: 0,
          tips_gross: 0,
          taxes_gross: 0,
          subscription_net: 0,
          subscription_gateway_fees: 0,
          gift_cards: 0,
          memberships: 0,
          refunds_gross: 0,
        };
      }
    };

    // Run recent period queries in parallel (these should be fast)
    // Wrap in try-catch to handle any errors
    let today, thisMonth, lastMonth, total;
    try {
      [
        today,
        thisMonth,
        lastMonth
      ] = await Promise.all([
        sumLedger(startOfToday.toISOString()),
        sumLedger(startOfMonth.toISOString()),
        sumLedger(startOfLastMonth.toISOString(), endOfLastMonth.toISOString())
      ]);

      // For total, use last 2 years instead of all time to avoid timeout
      // In production, consider using a materialized view or cached aggregation
      total = await sumLedger(twoYearsAgo.toISOString());
    } catch (err) {
      console.error("Error calculating revenue:", err);
      // Return zero values if revenue calculation fails
      const zeroRevenue = {
        service_collected_net: 0,
        platform_commission_gross: 0,
        platform_refund_impact: 0,
        platform_commission_net: 0,
        gateway_fees: 0,
        platform_take_net: 0,
        tips_gross: 0,
        taxes_gross: 0,
        subscription_net: 0,
        subscription_gateway_fees: 0,
        gift_cards: 0,
        memberships: 0,
        refunds_gross: 0,
      };
      today = zeroRevenue;
      thisMonth = zeroRevenue;
      lastMonth = zeroRevenue;
      total = zeroRevenue;
    }

    const revenueGrowth =
      lastMonth.platform_take_net !== 0
        ? Math.round(((thisMonth.platform_take_net - lastMonth.platform_take_net) / Math.abs(lastMonth.platform_take_net)) * 100)
        : 0;

    // Calculate growth percentages
    const usersGrowth = usersLastMonth && usersLastMonth > 0
      ? Math.round(((usersThisMonth || 0) - usersLastMonth) / usersLastMonth * 100)
      : (usersThisMonth || 0) > 0 ? 100 : 0;
    
    const providersGrowth = providersLastMonth && providersLastMonth > 0
      ? Math.round(((providersThisMonth || 0) - providersLastMonth) / providersLastMonth * 100)
      : (providersThisMonth || 0) > 0 ? 100 : 0;
    
    const bookingsGrowth = bookingsLastMonth && bookingsLastMonth > 0
      ? Math.round(((bookingsThisMonth || 0) - bookingsLastMonth) / bookingsLastMonth * 100)
      : (bookingsThisMonth || 0) > 0 ? 100 : 0;

    return successResponse({
      total_users: totalUsers || 0,
      total_providers: totalProviders || 0,
      total_bookings: totalBookings || 0,
      total_revenue: total.platform_take_net,
      pending_approvals: pendingApprovals || 0,
      active_bookings_today: bookingsToday || 0,
      revenue_today: today.platform_take_net,
      revenue_this_month: thisMonth.platform_take_net,
      revenue_growth: revenueGrowth,
      users_growth: usersGrowth,
      providers_growth: providersGrowth,
      bookings_growth: bookingsGrowth,

      // New breakdowns (all-time)
      gmv_total: total.service_collected_net,
      platform_net_total: total.platform_take_net + total.subscription_net,
      platform_commission_gross_total: total.platform_commission_gross,
      platform_refund_impact_total: total.platform_refund_impact,
      gateway_fees_total: total.gateway_fees,
      subscription_net_total: total.subscription_net,
      subscription_gateway_fees_total: total.subscription_gateway_fees,
      tips_total: total.tips_gross,
      taxes_total: total.taxes_gross,
      gift_card_sales_total: total.gift_cards,
      membership_sales_total: total.memberships,
      refunds_total: total.refunds_gross,
      
      // Gift card breakdowns
      gift_card_metrics: {
        total_sales: total.gift_cards,
        // Note: Redemptions are tracked separately via gift_card_redemptions table
        // Outstanding liability = sum of active gift card balances
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load dashboard data');
  }
}
