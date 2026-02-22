import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subDays } from "date-fns";

/**
 * GET /api/admin/gift-cards/metrics
 * Get gift card metrics for dashboard and reports (superadmin only)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);

    const supabaseAdmin = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    
    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "7d":
        startDate = subDays(now, 7);
        break;
      case "30d":
        startDate = subDays(now, 30);
        break;
      case "90d":
        startDate = subDays(now, 90);
        break;
      case "1y":
        startDate = subDays(now, 365);
        break;
      default:
        startDate = subDays(now, 30);
    }

    // Get gift card sales (from finance_transactions)
    const { data: salesTransactions, error: salesError } = await supabaseAdmin
      .from("finance_transactions")
      .select("amount, net, created_at")
      .eq("transaction_type", "gift_card_sale")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: false });

    if (salesError) {
      console.error("Error fetching gift card sales:", salesError);
    }

    // Get gift card orders
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("gift_card_orders")
      .select("id, amount, currency, status, created_at, gift_card_id")
      .eq("status", "paid")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("Error fetching gift card orders:", ordersError);
    }

    // Get gift card redemptions
    const { data: redemptions, error: redemptionsError } = await supabaseAdmin
      .from("gift_card_redemptions")
      .select("id, amount, currency, status, captured_at, created_at")
      .eq("status", "captured")
      .not("captured_at", "is", null)
      .gte("captured_at", startDate.toISOString())
      .lte("captured_at", now.toISOString())
      .order("captured_at", { ascending: false });

    if (redemptionsError) {
      console.error("Error fetching gift card redemptions:", redemptionsError);
    }

    // Get active gift cards (unredeemed balance)
    const { data: activeGiftCards, error: activeError } = await supabaseAdmin
      .from("gift_cards")
      .select("balance, initial_balance, currency")
      .eq("is_active", true)
      .gt("balance", 0);

    if (activeError) {
      console.error("Error fetching active gift cards:", activeError);
    }

    // Calculate metrics
    const totalSales = (salesTransactions || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalSalesNet = (salesTransactions || []).reduce((sum, t) => sum + Number(t.net || 0), 0);
    const totalRedemptions = (redemptions || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const totalOrders = (orders || []).length;
    const totalRedemptionCount = (redemptions || []).length;
    const outstandingLiability = (activeGiftCards || []).reduce((sum, g) => sum + Number(g.balance || 0), 0);
    const totalIssued = (activeGiftCards || []).reduce((sum, g) => sum + Number(g.initial_balance || 0), 0);
    
    // Calculate redemption rate
    const redemptionRate = totalOrders > 0 ? (totalRedemptionCount / totalOrders) * 100 : 0;
    
    // Average values
    const averageSaleValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const averageRedemptionValue = totalRedemptionCount > 0 ? totalRedemptions / totalRedemptionCount : 0;

    // Sales by day
    const salesByDay: Record<string, { sales: number; count: number }> = {};
    (salesTransactions || []).forEach((t) => {
      const date = new Date(t.created_at).toISOString().split("T")[0];
      if (!salesByDay[date]) {
        salesByDay[date] = { sales: 0, count: 0 };
      }
      salesByDay[date].sales += Number(t.amount || 0);
      salesByDay[date].count += 1;
    });

    // Redemptions by day
    const redemptionsByDay: Record<string, { redemptions: number; count: number }> = {};
    (redemptions || []).forEach((r) => {
      const date = new Date(r.captured_at || r.created_at).toISOString().split("T")[0];
      if (!redemptionsByDay[date]) {
        redemptionsByDay[date] = { redemptions: 0, count: 0 };
      }
      redemptionsByDay[date].redemptions += Number(r.amount || 0);
      redemptionsByDay[date].count += 1;
    });

    // Fill missing dates
    const salesByDayArray = [];
    const redemptionsByDayArray = [];
    const current = new Date(startDate);
    while (current <= now) {
      const dateStr = current.toISOString().split("T")[0];
      salesByDayArray.push({
        date: dateStr,
        sales: salesByDay[dateStr]?.sales || 0,
        count: salesByDay[dateStr]?.count || 0,
      });
      redemptionsByDayArray.push({
        date: dateStr,
        redemptions: redemptionsByDay[dateStr]?.redemptions || 0,
        count: redemptionsByDay[dateStr]?.count || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return successResponse({
      period,
      summary: {
        totalSales,
        totalSalesNet,
        totalRedemptions,
        totalOrders,
        totalRedemptionCount,
        outstandingLiability,
        totalIssued,
        redemptionRate,
        averageSaleValue,
        averageRedemptionValue,
      },
      trends: {
        salesByDay: salesByDayArray,
        redemptionsByDay: redemptionsByDayArray,
      },
      accounting: {
        note: "Gift card sales are a liability (cash received but services owed). Revenue is recognized when gift cards are redeemed via bookings (platform commission).",
        liability: outstandingLiability,
        recognizedRevenue: totalRedemptions, // This is the value redeemed, actual revenue is commission on bookings
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch gift card metrics");
  }
}
