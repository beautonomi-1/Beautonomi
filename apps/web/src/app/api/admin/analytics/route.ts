import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  fetchFinanceLedgerExportRowsForTenant,
  fetchFinanceLedgerRowsForTenant,
  resolveFinanceLedgerRowProviderId,
} from "@/lib/admin/finance-ledger-tenant";
import {
  aggregateFinanceLedgerRows,
  platformRevenueNetFromAggregate,
  gatewayFeesTotalFromAggregate,
} from "@/lib/admin/aggregate-finance-ledger-rows";
import { buildBookingStatusBreakdown } from "@/lib/admin/analytics-booking-status-breakdown";
import { computeContributionMargin, computeTakeRate } from "@/lib/admin/marketplace-health";
import { normalizeBookingChannel } from "@/lib/reports/booking-channel-breakdown";
import { eachUtcDay, MAX_BOOKINGS_FOR_REPORT } from "@/lib/reports/constants";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import { fetchMarketplaceHealthSeries } from "@/lib/admin/marketplace-health-api";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d'; // 7d, 30d, 90d, 1y

    const now = new Date();
    let startDate: Date;
    
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

    /** Tenant-scoped daily counts (bookings / providers) or customer users tied to this tenant (preferred home + activity sample). */
    const getDailyTimeSeries = async (
      table: string,
      dateField: string = "created_at",
      extraFilter?: { column: string; value: string }
    ) => {
      let query = supabase
        .from(table)
        .select(dateField)
        .gte(dateField, startDate.toISOString())
        .order(dateField, { ascending: true });

      if (table === "bookings" || table === "providers") {
        query = query.eq("tenant_id", tenantId);
      }
      if (extraFilter) {
        query = query.eq(extraFilter.column, extraFilter.value);
      }
      if (table === "users") {
        const { data: createdRows, error: usersRpcErr } = await admin.rpc("admin_users_created_at_in_scope", {
          p_tenant_id: tenantId,
          p_since: startDate.toISOString(),
          p_role: "customer",
        });
        if (usersRpcErr) {
          console.error("Error fetching users (scoped created_at):", usersRpcErr);
          return [];
        }
        const grouped: Record<string, number> = {};
        type CreatedRow = { created_at?: string };
        ((createdRows || []) as CreatedRow[]).forEach((item) => {
          const date = new Date(String(item.created_at ?? "")).toISOString().split("T")[0];
          grouped[date] = (grouped[date] || 0) + 1;
        });
        const result: Array<{ date: string; count: number }> = [];
        for (const dateStr of eachUtcDay(startDate, now)) {
          result.push({ date: dateStr, count: grouped[dateStr] || 0 });
        }
        return result;
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Error fetching ${table}:`, error);
        return [];
      }

      const grouped2: Record<string, number> = {};
      type RowWithDate = Record<string, unknown>;
      ((data || []) as unknown as RowWithDate[]).forEach((item: RowWithDate) => {
        const date = new Date(String(item[dateField] ?? "")).toISOString().split("T")[0];
        grouped2[date] = (grouped2[date] || 0) + 1;
      });

      const result2: Array<{ date: string; count: number }> = [];
      for (const dateStr of eachUtcDay(startDate, now)) {
        result2.push({ date: dateStr, count: grouped2[dateStr] || 0 });
      }

      return result2;
    };

    // Get platform revenue time series using the canonical formula
    // §Phase 9: was summing `net` on payment/charge/refund rows only (= commission base = 0
    // when no commission is charged). Now fetches ALL ledger rows, runs the full reducer,
    // and emits platformRevenueNetFromAggregate per day — matching the Finance summary.
    const getRevenueTimeSeries = async () => {
      let data: Awaited<ReturnType<typeof fetchFinanceLedgerRowsForTenant>> = [];
      try {
        data = await fetchFinanceLedgerRowsForTenant(admin, tenantId, {
          start: startDate.toISOString(),
          end: now.toISOString(),
        });
      } catch (e) {
        console.error('Error fetching revenue:', e);
        return [];
      }

      // Bucket by day, then aggregate each day with the canonical module.
      const byDay: Record<string, typeof data> = {};
      data.forEach((item) => {
        const date = new Date(item.created_at ?? "").toISOString().split('T')[0];
        if (!byDay[date]) byDay[date] = [];
        byDay[date].push(item);
      });

      const result: Array<{ date: string; revenue: number }> = [];
      for (const dateStr of eachUtcDay(startDate, now)) {
        const dayRows = byDay[dateStr] ?? [];
        const agg = aggregateFinanceLedgerRows(dayRows);
        result.push({ date: dateStr, revenue: platformRevenueNetFromAggregate(agg) });
      }

      return result;
    };

    // Get provider status breakdown (all providers by current status)
    const getProviderStatusBreakdown = async () => {
      const { data, error } = await supabase
        .from('providers')
        .select('status')
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('Error fetching provider status:', error);
        return { active: 0, pending: 0, suspended: 0, rejected: 0 };
      }

      const breakdown = {
        active: 0,
        pending: 0,
        suspended: 0,
        rejected: 0,
      };

      type ProviderStatusRow = { status?: string };
      (data || []).forEach((p: ProviderStatusRow) => {
        if (p.status === 'active') breakdown.active++;
        else if (p.status === 'pending_approval') breakdown.pending++;
        else if (p.status === 'suspended') breakdown.suspended++;
        else if (p.status === 'rejected') breakdown.rejected++;
      });

      return breakdown;
    };

    type ScheduledBookingRow = {
      scheduled_at: string;
      status?: string | null;
      booking_source?: string | null;
    };

    const fetchScheduledBookingsInPeriod = async (): Promise<ScheduledBookingRow[]> => {
      try {
        return await fetchAllLedgerPages<ScheduledBookingRow>(
          admin
            .from("bookings")
            .select("scheduled_at, status, booking_source")
            .eq("tenant_id", tenantId)
            .gte("scheduled_at", startDate.toISOString())
            .lte("scheduled_at", now.toISOString())
            .order("scheduled_at", { ascending: true }),
          MAX_BOOKINGS_FOR_REPORT,
        );
      } catch (e) {
        console.error("Error fetching scheduled bookings for analytics:", e);
        return [];
      }
    };

    const buildBookingsTimeSeriesFromRows = (rows: ScheduledBookingRow[]) => {
      const grouped: Record<string, number> = {};
      for (const b of rows) {
        const date = new Date(String(b.scheduled_at ?? "")).toISOString().split("T")[0];
        grouped[date] = (grouped[date] || 0) + 1;
      }
      const result: Array<{ date: string; count: number }> = [];
      for (const dateStr of eachUtcDay(startDate, now)) {
        result.push({ date: dateStr, count: grouped[dateStr] || 0 });
      }
      return result;
    };

    const getBookingStatusBreakdownFromRows = (rows: ScheduledBookingRow[]) =>
      buildBookingStatusBreakdown(rows);

    const getBookingsByChannelFromRows = (rows: ScheduledBookingRow[]) => {
      const counts = new Map<string, number>();
      for (const b of rows) {
        const channel = normalizeBookingChannel(b.booking_source);
        counts.set(channel, (counts.get(channel) ?? 0) + 1);
      }
      const total = [...counts.values()].reduce((s, c) => s + c, 0);
      return [...counts.entries()]
        .map(([channel, count]) => ({
          channel,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);
    };

    // Get top providers by revenue (merged ledger: provider in tenant OR booking in tenant)
    const getTopProviders = async (): Promise<{
      topProviders: Array<{ provider_id: string; business_name: string; revenue: number }>;
      provider_net_earnings_total: number;
    }> => {
      let merged: Awaited<ReturnType<typeof fetchFinanceLedgerExportRowsForTenant>>;
      try {
        merged = await fetchFinanceLedgerExportRowsForTenant(
          admin,
          tenantId,
          { start: startDate.toISOString(), end: now.toISOString() },
          {
            transactionTypes: [
              "provider_earnings",
              "travel_fee",
              "tip",
              "cancellation_fee",
              "walk_in_additional_charge",
            ],
          },
        );
      } catch (err) {
        console.error("Error fetching top providers ledger:", err);
        return { topProviders: [], provider_net_earnings_total: 0 };
      }

      const providerRevenue: Record<string, number> = {};
      for (const row of merged) {
        const pid = resolveFinanceLedgerRowProviderId(row);
        if (!pid) continue;
        const amt = Number(row.net ?? row.amount ?? 0);
        providerRevenue[pid] = (providerRevenue[pid] || 0) + amt;
      }

      const provider_net_earnings_total = Object.values(providerRevenue).reduce((s, v) => s + v, 0);

      const topProviders = Object.entries(providerRevenue)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([providerId, revenue]) => ({ provider_id: providerId, revenue }));

      if (topProviders.length > 0) {
        const providerIds = topProviders.map((p) => p.provider_id);
        const { data: providers } = await supabase
          .from("providers")
          .select("id, business_name")
          .eq("tenant_id", tenantId)
          .in("id", providerIds);

        const providerMap = new Map(
          (providers || []).map((p: { id: string; business_name?: string }) => [p.id, p.business_name]),
        );

        return {
          provider_net_earnings_total,
          topProviders: topProviders.map((p) => ({
            provider_id: p.provider_id,
            business_name: providerMap.get(p.provider_id) || "Unknown",
            revenue: p.revenue,
          })),
        };
      }

      return { topProviders: [], provider_net_earnings_total };
    };

    const getLedgerTotals = async () => {
      try {
        const rows = await fetchFinanceLedgerRowsForTenant(admin, tenantId, {
          start: startDate.toISOString(),
          end: now.toISOString(),
        });
        const agg = aggregateFinanceLedgerRows(rows);
        return {
          platform_net_total: platformRevenueNetFromAggregate(agg),
          take_rate: computeTakeRate(agg),
          contribution_margin: computeContributionMargin(agg),
          gateway_fees_total: gatewayFeesTotalFromAggregate(agg),
          terminal_revenue: agg.terminal_revenue_gross,
          terminal_gateway_fees: agg.terminal_gateway_fees,
          revenue_streams: {
            booking_commission: agg.platform_take_net,
            subscriptions: agg.subscription_net,
            ads: agg.ads_net,
            service_fees: agg.service_fee_revenue,
            marketing_credits: agg.marketing_credit_net,
            gift_card_breakage: agg.gift_card_breakage_revenue,
          },
        };
      } catch (e) {
        console.error("Error fetching ledger totals for analytics:", e);
        return {
          platform_net_total: 0,
          take_rate: 0,
          contribution_margin: 0,
          gateway_fees_total: 0,
          terminal_revenue: 0,
          terminal_gateway_fees: 0,
          revenue_streams: {
            booking_commission: 0,
            subscriptions: 0,
            ads: 0,
            service_fees: 0,
            marketing_credits: 0,
            gift_card_breakage: 0,
          },
        };
      }
    };

    const scheduledBookingsPromise = fetchScheduledBookingsInPeriod();

    // Run all queries in parallel (users = customers only for growth chart)
    const [
      usersTimeSeries,
      providersTimeSeries,
      scheduledBookings,
      revenueTimeSeries,
      providerStatusBreakdown,
      topProvidersResult,
      ledgerTotals,
      healthSeries,
    ] = await Promise.all([
      getDailyTimeSeries("users", "created_at"),
      getDailyTimeSeries("providers", "created_at"),
      scheduledBookingsPromise,
      getRevenueTimeSeries(),
      getProviderStatusBreakdown(),
      getTopProviders(),
      getLedgerTotals(),
      fetchMarketplaceHealthSeries(supabase, tenantId, startDate.toISOString(), now.toISOString()),
    ]);

    const bookingsTimeSeries = buildBookingsTimeSeriesFromRows(scheduledBookings);
    const bookingStatusBreakdown = getBookingStatusBreakdownFromRows(scheduledBookings);
    const bookingsByChannel = getBookingsByChannelFromRows(scheduledBookings);
    const topProviders = topProvidersResult.topProviders;
    const provider_net_earnings_total = topProvidersResult.provider_net_earnings_total;

    return successResponse({
      period,
      timeSeries: {
        users: usersTimeSeries,
        providers: providersTimeSeries,
        bookings: bookingsTimeSeries,
        revenue: revenueTimeSeries,
      },
      breakdowns: {
        providerStatus: providerStatusBreakdown,
        bookingStatus: bookingStatusBreakdown,
        bookingsByChannel,
      },
      bookingsByChannel,
      topProviders,
      provider_net_earnings_total,
      platform_net_total: ledgerTotals.platform_net_total,
      take_rate: ledgerTotals.take_rate,
      contribution_margin: ledgerTotals.contribution_margin,
      gateway_fees_total: ledgerTotals.gateway_fees_total,
      terminal_revenue: ledgerTotals.terminal_revenue,
      terminal_gateway_fees: ledgerTotals.terminal_gateway_fees,
      financeNote:
        "Gateway and terminal totals use the same ledger aggregate as Finance overview. Fee reconciliations auto-generate daily.",
      channelBasisNote:
        "Bookings use scheduled_at in the selected period through now (matches the bookings report). Channel labels from booking_source (null treated as online). Counts only — not completion rate.",
      revenue_streams: ledgerTotals.revenue_streams,
      marketplace_health_series: healthSeries,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load analytics');
  }
}
