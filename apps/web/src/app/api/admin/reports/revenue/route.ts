import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
    }

    // Get revenue by day
    const { data: bookings } = await supabase
      .from('bookings')
      .select('scheduled_at, total_amount, status, provider_id')
      .gte('scheduled_at', startDate.toISOString())
      .lte('scheduled_at', endDate.toISOString())
      .in('status', ['completed', 'confirmed']);

    const revenueByDay: Record<string, { revenue: number; bookings: number }> = {};
    const revenueByProvider: Record<string, { revenue: number; bookings: number; provider_name: string }> = {};
    const revenueByStatus: Record<string, { revenue: number; bookings: number }> = {};

    let totalRevenue = 0;

    (bookings || []).forEach((booking: any) => {
      const date = new Date(booking.scheduled_at).toISOString().split('T')[0];
      const amount = booking.total_amount || 0;

      // By day
      if (!revenueByDay[date]) {
        revenueByDay[date] = { revenue: 0, bookings: 0 };
      }
      revenueByDay[date].revenue += amount;
      revenueByDay[date].bookings += 1;

      // By provider
      if (booking.provider_id) {
        if (!revenueByProvider[booking.provider_id]) {
          revenueByProvider[booking.provider_id] = { revenue: 0, bookings: 0, provider_name: 'Unknown' };
        }
        revenueByProvider[booking.provider_id].revenue += amount;
        revenueByProvider[booking.provider_id].bookings += 1;
      }

      // By status
      if (!revenueByStatus[booking.status]) {
        revenueByStatus[booking.status] = { revenue: 0, bookings: 0 };
      }
      revenueByStatus[booking.status].revenue += amount;
      revenueByStatus[booking.status].bookings += 1;

      totalRevenue += amount;
    });

    // Get provider names
    const providerIds = Object.keys(revenueByProvider);
    if (providerIds.length > 0) {
      const { data: providers } = await supabase
        .from('providers')
        .select('id, business_name')
        .in('id', providerIds);

      (providers || []).forEach((p: any) => {
        if (revenueByProvider[p.id]) {
          revenueByProvider[p.id].provider_name = p.business_name;
        }
      });
    }

    // Fill missing dates
    const revenueByDayArray = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      revenueByDayArray.push({
        date: dateStr,
        revenue: revenueByDay[dateStr]?.revenue || 0,
        bookings: revenueByDay[dateStr]?.bookings || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    // Get gift card metrics
    const supabaseAdmin = getSupabaseAdmin();

    // Gift card sales
    const { data: salesTransactions } = await supabaseAdmin
      .from("finance_transactions")
      .select("amount, created_at")
      .eq("transaction_type", "gift_card_sale")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    // Gift card redemptions
    const { data: redemptions } = await supabaseAdmin
      .from("gift_card_redemptions")
      .select("amount, captured_at, created_at")
      .eq("status", "captured")
      .not("captured_at", "is", null)
      .gte("captured_at", startDate.toISOString())
      .lte("captured_at", endDate.toISOString());

    // Active gift cards (outstanding liability)
    const { data: activeGiftCards } = await supabaseAdmin
      .from("gift_cards")
      .select("balance")
      .eq("is_active", true)
      .gt("balance", 0);

    const totalSales = (salesTransactions || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalRedemptions = (redemptions || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const outstandingLiability = (activeGiftCards || []).reduce((sum, g) => sum + Number(g.balance || 0), 0);
    
    // Get total orders for redemption rate
    const { data: orders } = await supabaseAdmin
      .from("gift_card_orders")
      .select("id")
      .eq("status", "paid")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());
    
    const totalOrders = (orders || []).length;
    const totalRedemptionCount = (redemptions || []).length;
    const redemptionRate = totalOrders > 0 ? (totalRedemptionCount / totalOrders) * 100 : 0;

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
    const iterDate = new Date(startDate);
    while (iterDate <= endDate) {
      const dateStr = iterDate.toISOString().split("T")[0];
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
      iterDate.setDate(iterDate.getDate() + 1);
    }

    return successResponse({
      period,
      totalRevenue,
      revenueByDay: revenueByDayArray,
      revenueByProvider: Object.values(revenueByProvider).sort((a, b) => b.revenue - a.revenue),
      revenueByService: [], // Can be enhanced later
      revenueByStatus: Object.entries(revenueByStatus).map(([status, data]) => ({
        status,
        ...data,
      })),
      giftCardMetrics: {
        totalSales,
        totalRedemptions,
        outstandingLiability,
        redemptionRate,
        salesByDay: salesByDayArray,
        redemptionsByDay: redemptionsByDayArray,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load revenue report');
  }
}
