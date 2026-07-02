import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerRowsForTenant } from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows, platformRevenueNetFromAggregate, gatewayFeesTotalFromAggregate } from "@/lib/admin/aggregate-finance-ledger-rows";
import {
  FINANCE_METRIC_CONTRACT_VERSION,
  getFinanceMetricContracts,
} from "@/lib/admin/finance-metric-contracts";
import {
  computeOrderSourceBreakdown,
  normalizeBookingChannel,
} from "@/lib/reports/booking-channel-breakdown";
import { RECOGNIZED_REVENUE_TYPES } from "@/lib/reports/provider-revenue-semantics";
import { eachUtcDay, MAX_BOOKINGS_FOR_REPORT } from "@/lib/reports/constants";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";

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

    // Revenue rows: align with how teams read "activity in period".
    // - Completed: anchor on completed_at (service may have been scheduled earlier).
    // - Confirmed (not yet completed): anchor on scheduled_at within the window.
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    // Paginate across PostgREST 1000-row cap for high-volume periods.
    type BookingRow = {
      id?: string;
      scheduled_at?: string;
      completed_at?: string;
      created_at?: string;
      total_amount?: number;
      total_paid?: number;
      total_refunded?: number;
      wallet_amount?: number;
      gift_card_amount?: number;
      provider_id?: string;
      status?: string;
      payment_status?: string;
      booking_source?: string | null;
    };

    const bookingSelect = "id, scheduled_at, completed_at, created_at, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, status, provider_id, payment_status, booking_source";

    const [completedBookings, confirmedBookings] = await Promise.all([
      fetchAllLedgerPages<BookingRow>(
        supabase
          .from("bookings")
          .select(bookingSelect)
          .eq("tenant_id", tenantId)
          .eq("status", "completed")
          .not("completed_at", "is", null)
          .gte("completed_at", startISO)
          .lte("completed_at", endISO),
        MAX_BOOKINGS_FOR_REPORT,
      ),
      fetchAllLedgerPages<BookingRow>(
        supabase
          .from("bookings")
          .select(bookingSelect)
          .eq("tenant_id", tenantId)
          .eq("status", "confirmed")
          .gte("scheduled_at", startISO)
          .lte("scheduled_at", endISO),
        MAX_BOOKINGS_FOR_REPORT,
      ),
    ]);

    const byId = new Map<string, BookingRow>();
    for (const b of [...completedBookings, ...confirmedBookings]) {
      const row = b as BookingRow;
      if (row?.id) byId.set(row.id, row);
    }
    const bookings: BookingRow[] = [...byId.values()];

    const channelGmv: Record<string, { gmv: number; bookings: number }> = {};
    const revenueByDay: Record<string, { revenue: number; actual_collected: number; bookings: number }> = {};
    const revenueByProvider: Record<string, { revenue: number; actual_collected: number; bookings: number; provider_name: string }> = {};
    const revenueByStatus: Record<string, { revenue: number; bookings: number }> = {};

    let totalRevenue = 0;
    let totalActualCollected = 0;
    let totalRefunded = 0;
    let totalWalletRevenue = 0;
    let totalGatewayRevenue = 0;
    let totalGiftCardRevenue = 0;

    const bucketDate = (booking: BookingRow): string | null => {
      const anchor =
        booking.status === "completed"
          ? booking.completed_at || booking.scheduled_at || booking.created_at
          : booking.scheduled_at || booking.created_at;
      if (!anchor) return null;
      const t = new Date(anchor).getTime();
      if (Number.isNaN(t)) return null;
      return new Date(anchor).toISOString().split("T")[0];
    };

    (bookings || []).forEach((booking: BookingRow) => {
      const date = bucketDate(booking);
      if (!date) return;
      const gmvAmount = Number(booking.total_amount ?? 0);
      const gatewayAmount = Number(booking.total_paid ?? 0);
      const refundedAmount = Number(booking.total_refunded ?? 0);
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

      const channel = normalizeBookingChannel(booking.booking_source);
      if (!channelGmv[channel]) channelGmv[channel] = { gmv: 0, bookings: 0 };
      channelGmv[channel].gmv += gmvAmount;
      channelGmv[channel].bookings += 1;

      totalRevenue += gmvAmount;
      totalActualCollected += collectedAmount;
      totalRefunded += refundedAmount;
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

    const bookingIds = bookings.map((b) => b.id).filter((id): id is string => typeof id === "string");
    const revenueByBooking = new Map<string, number>();
    if (bookingIds.length > 0) {
      const ledgerRows = await fetchFinanceLedgerRowsForTenant(
        supabase,
        tenantId,
        { start: startDate.toISOString(), end: endDate.toISOString() },
        { transactionTypes: [...RECOGNIZED_REVENUE_TYPES] },
      );
      for (const row of ledgerRows ?? []) {
        const bid = (row as { booking_id?: string | null }).booking_id;
        if (!bid) continue;
        revenueByBooking.set(
          bid,
          (revenueByBooking.get(bid) ?? 0) + Number((row as { net?: number }).net ?? 0),
        );
      }
    }

    const revenueByServiceMap = new Map<
      string,
      { service_id: string; service_name: string; revenue: number; bookingIds: Set<string> }
    >();
    if (bookingIds.length > 0) {
      const { data: serviceRows } = await supabase
        .from("booking_services")
        .select("booking_id, price, offering_id, offerings(title)")
        .in("booking_id", bookingIds);

      type ServiceRow = {
        booking_id?: string;
        price?: number;
        offering_id?: string;
        offerings?: { title?: string } | Array<{ title?: string }>;
      };
      const servicesByBooking = new Map<string, ServiceRow[]>();
      for (const row of (serviceRows ?? []) as ServiceRow[]) {
        if (!row.booking_id) continue;
        const list = servicesByBooking.get(row.booking_id) ?? [];
        list.push(row);
        servicesByBooking.set(row.booking_id, list);
      }

      for (const booking of bookings) {
        const id = booking.id;
        if (!id) continue;
        const bookingRevenue = revenueByBooking.get(id) ?? 0;
        const svcs = servicesByBooking.get(id) ?? [];
        if (svcs.length === 0 || bookingRevenue <= 0) continue;
        const totalPrice = svcs.reduce((s, x) => s + Number(x.price ?? 0), 0);
        for (const service of svcs) {
          const offering = Array.isArray(service.offerings)
            ? service.offerings[0]
            : service.offerings;
          const serviceName = offering?.title ?? "Unknown service";
          const serviceId = service.offering_id ?? serviceName;
          const proportion =
            totalPrice > 0 ? Number(service.price ?? 0) / totalPrice : 1 / svcs.length;
          const serviceRevenue = bookingRevenue * proportion;
          const existing = revenueByServiceMap.get(serviceId) ?? {
            service_id: serviceId,
            service_name: serviceName,
            revenue: 0,
            bookingIds: new Set<string>(),
          };
          existing.revenue += serviceRevenue;
          existing.bookingIds.add(id);
          revenueByServiceMap.set(serviceId, existing);
        }
      }
    }

    const revenueByService = Array.from(revenueByServiceMap.values())
      .map((row) => ({
        service_id: row.service_id,
        service_name: row.service_name,
        revenue: row.revenue,
        bookings: row.bookingIds.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Fill missing dates (UTC-safe)
    const revenueByDayArray = [];
    for (const dateStr of eachUtcDay(startDate, endDate)) {
      revenueByDayArray.push({
        date: dateStr,
        revenue: revenueByDay[dateStr]?.revenue || 0,
        actual_collected: revenueByDay[dateStr]?.actual_collected || 0,
        bookings: revenueByDay[dateStr]?.bookings || 0,
      });
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

    // Fill missing dates (UTC-safe)
    const salesByDayArray = [];
    const redemptionsByDayArray = [];
    for (const dateStr of eachUtcDay(startDate, endDate)) {
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
    }

    // Unified platform revenue breakdown from finance ledger
    const allLedgerRows = await fetchFinanceLedgerRowsForTenant(
      supabase,
      tenantId,
      { start: startDate.toISOString(), end: endDate.toISOString() },
    );
    const ledgerAgg = aggregateFinanceLedgerRows(allLedgerRows);

    const platformRecognizedRevenueNet = platformRevenueNetFromAggregate(ledgerAgg);
    const gatewayFeesTotal = gatewayFeesTotalFromAggregate(ledgerAgg);

    const { data: productOrders } = await supabase
      .from("product_orders")
      .select("order_source, total_amount, payment_status")
      .eq("tenant_id", tenantId)
      .eq("payment_status", "paid")
      .or("order_source.is.null,order_source.neq.appointment")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    const productBySource = computeOrderSourceBreakdown({
      orders: (productOrders || []).map((o: { order_source?: string | null; total_amount?: number }) => ({
        order_source: o.order_source,
        units: 1,
        revenue: Number(o.total_amount ?? 0),
      })),
    });

    return successResponse({
      period,
      // GMV: total booking value at time of booking (what was charged)
      totalRevenue,
      // Gross collected: gateway + wallet + gift card (before refunds)
      totalActualCollected,
      // Total refunded back to customers
      totalRefunded,
      // Net collected: gross collected minus refunds
      netCollected: totalActualCollected - totalRefunded,
      // Breakdown of how actual_collected is composed
      collectionBreakdown: {
        gateway: totalGatewayRevenue,
        wallet: totalWalletRevenue,
        gift_card: totalGiftCardRevenue,
      },
      revenueByDay: revenueByDayArray,
      revenueByProvider: Object.values(revenueByProvider).sort((a, b) => b.revenue - a.revenue),
      revenueByService,
      revenueByStatus: Object.entries(revenueByStatus).map(([status, data]) => ({
        status,
        ...data,
      })),
      channelGmvBreakdown: Object.entries(channelGmv).map(([channel, data]) => ({
        channel,
        gmv: data.gmv,
        bookings: data.bookings,
      })),
      productOrdersBySource: productBySource,
      channelBasisNote:
        "Booking GMV uses completed_at (completed) or scheduled_at (confirmed) anchors. Product orders exclude appointment mirrors.",
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
      // Booking-side operational metric (GMV after discounts), not platform recognized revenue.
      gmvAfterDiscounts: totalRevenue - totalPromotionDiscounts,
      netRevenueAfterDiscounts: totalRevenue - totalPromotionDiscounts,

      platformRevenue: {
        booking_commission_net: ledgerAgg.platform_take_net,
        subscription_net: ledgerAgg.subscription_net,
        ads_net: ledgerAgg.ads_net,
        marketing_credit_net: ledgerAgg.marketing_credit_net,
        service_fee_revenue_net: ledgerAgg.service_fee_revenue,
        total_platform_revenue_net: platformRecognizedRevenueNet,
        gateway_fees_total: gatewayFeesTotal,
        provider_earnings_net: ledgerAgg.provider_earnings_net,
        refunds_gross: ledgerAgg.refunds_gross,
        refunds_abs_gross: ledgerAgg.refunds_abs_gross,
        provider_refund_impact_net: ledgerAgg.provider_refund_net_impact,
        platform_refund_contra: ledgerAgg.platform_refund_contra,
        tips_gross: ledgerAgg.tips_gross,
        taxes_gross: ledgerAgg.taxes_gross,
      },
      passThrough: {
        taxes_collected: ledgerAgg.taxes_gross,
        tips_collected: ledgerAgg.tips_gross,
      },
      metrics_meta: {
        contract_version: FINANCE_METRIC_CONTRACT_VERSION,
        generated_at: new Date().toISOString(),
        contracts: getFinanceMetricContracts([
          "platformRecognizedRevenue",
          "providerNetEarnings",
          "taxesCollected",
        ]),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load revenue report');
  }
}
