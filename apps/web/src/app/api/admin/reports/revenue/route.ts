import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerRowsForTenant } from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows } from "@/lib/admin/aggregate-finance-ledger-rows";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    
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
    // Includes total_amount (GMV) + actual cash collected (total_paid + wallet_amount + gift_card).
    // total_amount = the service price — what was charged to the customer (GMV).
    // actual_collected = total_paid (gateway) + wallet_amount + gift_card_amount — real money received.
    const { data: bookings } = await supabase
      .from('bookings')
      .select('scheduled_at, total_amount, total_paid, wallet_amount, gift_card_amount, status, provider_id, payment_status')
      .eq('tenant_id', tenantId)
      .gte('scheduled_at', startDate.toISOString())
      .lte('scheduled_at', endDate.toISOString())
      .in('status', ['completed', 'confirmed']);

    const revenueByDay: Record<string, { revenue: number; actual_collected: number; bookings: number }> = {};
    const revenueByProvider: Record<string, { revenue: number; actual_collected: number; bookings: number; provider_name: string }> = {};
    const revenueByStatus: Record<string, { revenue: number; bookings: number }> = {};

    let totalRevenue = 0;
    let totalActualCollected = 0;
    let totalWalletRevenue = 0;
    let totalGatewayRevenue = 0;
    let totalGiftCardRevenue = 0;

    type BookingRow = { scheduled_at?: string; total_amount?: number; total_paid?: number; wallet_amount?: number; gift_card_amount?: number; provider_id?: string; status?: string; payment_status?: string };
    (bookings || []).forEach((booking: BookingRow) => {
      const date = new Date(booking.scheduled_at ?? "").toISOString().split('T')[0];
      const gmvAmount = Number(booking.total_amount ?? 0);
      const gatewayAmount = Number(booking.total_paid ?? 0);
      const walletAmount = Number(booking.wallet_amount ?? 0);
      const giftCardAmount = Number(booking.gift_card_amount ?? 0);
      const collectedAmount = gatewayAmount + walletAmount + giftCardAmount;

      // By day (GMV + actual collected)
      if (!revenueByDay[date]) {
        revenueByDay[date] = { revenue: 0, actual_collected: 0, bookings: 0 };
      }
      revenueByDay[date].revenue += gmvAmount;
      revenueByDay[date].actual_collected += collectedAmount;
      revenueByDay[date].bookings += 1;

      // By provider
      if (booking.provider_id) {
        if (!revenueByProvider[booking.provider_id]) {
          revenueByProvider[booking.provider_id] = { revenue: 0, actual_collected: 0, bookings: 0, provider_name: 'Unknown' };
        }
        revenueByProvider[booking.provider_id].revenue += gmvAmount;
        revenueByProvider[booking.provider_id].actual_collected += collectedAmount;
        revenueByProvider[booking.provider_id].bookings += 1;
      }

      // By status
      const status = booking.status ?? "unknown";
      if (!revenueByStatus[status]) {
        revenueByStatus[status] = { revenue: 0, bookings: 0 };
      }
      revenueByStatus[status].revenue += gmvAmount;
      revenueByStatus[status].bookings += 1;

      totalRevenue += gmvAmount;
      totalActualCollected += collectedAmount;
      totalWalletRevenue += walletAmount;
      totalGatewayRevenue += gatewayAmount;
      totalGiftCardRevenue += giftCardAmount;
    });

    // Get provider names
    const providerIds = Object.keys(revenueByProvider);
    if (providerIds.length > 0) {
      const { data: providers } = await supabase
        .from('providers')
        .select('id, business_name')
        .eq('tenant_id', tenantId)
        .in('id', providerIds);

      (providers || []).forEach((p: { id: string; business_name?: string }) => {
        if (revenueByProvider[p.id]) {
          revenueByProvider[p.id].provider_name = p.business_name ?? "Unknown";
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
        actual_collected: revenueByDay[dateStr]?.actual_collected || 0,
        bookings: revenueByDay[dateStr]?.bookings || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    // Additional ledger metrics from finance_transactions (new accounting types)
    const cancellationFeeRows = await fetchFinanceLedgerRowsForTenant(
      supabase,
      tenantId,
      { start: startDate.toISOString(), end: endDate.toISOString() },
      { transactionType: "cancellation_fee" }
    );
    const promoDiscountRows = await fetchFinanceLedgerRowsForTenant(
      supabase,
      tenantId,
      { start: startDate.toISOString(), end: endDate.toISOString() },
      { transactionType: "promotion_discount" }
    );
    const totalCancellationFeesRetained = (cancellationFeeRows || []).reduce(
      (s, r) => s + Number(r.net ?? r.amount ?? 0),
      0
    );
    const totalPromotionDiscounts = (promoDiscountRows || []).reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0
    );

    // Get gift card metrics
    const salesTransactions = await fetchFinanceLedgerRowsForTenant(
      supabase,
      tenantId,
      { start: startDate.toISOString(), end: endDate.toISOString() },
      { transactionType: "gift_card_sale" }
    );

    // Redemptions always reference a booking — scope by booking.tenant_id
    const { data: redemptions } = await supabase
      .from("gift_card_redemptions")
      .select("amount, captured_at, created_at, bookings!inner(tenant_id)")
      .eq("bookings.tenant_id", tenantId)
      .eq("status", "captured")
      .not("captured_at", "is", null)
      .gte("captured_at", startDate.toISOString())
      .lte("captured_at", endDate.toISOString());

    const { data: liabilityRows } = await supabase
      .from("gift_cards")
      .select("balance")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .gt("balance", 0);

    const outstandingLiability = (liabilityRows || []).reduce(
      (sum, g) => sum + Number(g.balance || 0),
      0
    );

    const totalSales = (salesTransactions || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalRedemptions = (redemptions || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const { data: orders } = await supabase
      .from("gift_card_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());
    
    const totalOrders = (orders || []).length;
    const totalRedemptionCount = (redemptions || []).length;
    const redemptionRate = totalOrders > 0 ? (totalRedemptionCount / totalOrders) * 100 : 0;

    // Sales by day
    const salesByDay: Record<string, { sales: number; count: number }> = {};
    (salesTransactions || []).forEach((t) => {
      if (!t.created_at) return;
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

    // Unified platform revenue breakdown from finance ledger
    const allLedgerRows = await fetchFinanceLedgerRowsForTenant(
      supabase,
      tenantId,
      { start: startDate.toISOString(), end: endDate.toISOString() },
    );
    const ledgerAgg = aggregateFinanceLedgerRows(allLedgerRows);

    const platformRevenueNet =
      ledgerAgg.platform_take_net + ledgerAgg.subscription_net + ledgerAgg.ads_net + ledgerAgg.service_fee_revenue;

    return successResponse({
      period,
      // GMV: total booking value at time of booking (what was charged)
      totalRevenue,
      // Actual collected: gateway + wallet + gift card (real money/credit received)
      totalActualCollected,
      // Breakdown of how actual_collected is composed
      collectionBreakdown: {
        gateway: totalGatewayRevenue,
        wallet: totalWalletRevenue,
        gift_card: totalGiftCardRevenue,
      },
      revenueByDay: revenueByDayArray,
      revenueByProvider: Object.values(revenueByProvider).sort((a, b) => b.revenue - a.revenue),
      revenueByService: [],
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
      cancellationFeesRetainedByProviders: totalCancellationFeesRetained,
      promotionDiscountsGiven: totalPromotionDiscounts,
      netRevenueAfterDiscounts: totalRevenue - totalPromotionDiscounts,

      platformRevenue: {
        booking_commission_net: ledgerAgg.platform_take_net,
        subscription_net: ledgerAgg.subscription_net,
        ads_net: ledgerAgg.ads_net,
        total_platform_revenue_net: platformRevenueNet,
        gateway_fees_total: ledgerAgg.gateway_fees_services + ledgerAgg.subscription_gateway_fees + ledgerAgg.ads_gateway_fees,
        provider_earnings_net: ledgerAgg.provider_earnings_net,
        refunds_gross: ledgerAgg.refunds_gross,
        tips_gross: ledgerAgg.tips_gross,
        taxes_gross: ledgerAgg.taxes_gross,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load revenue report');
  }
}
